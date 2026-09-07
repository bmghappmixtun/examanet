// @ts-nocheck
/**
 * Forgot Password — Step 2: verify the code and set a new password
 *
 * D1 direct (was prisma). Per security model, we keep all checks.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction, getClientIp } from '@/lib/security';
import { hashPassword } from '@/lib/auth';
import { sendPasswordChangedEmail } from '@/lib/email';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  const ip = getClientIp(req);

  let body: { email?: string; code?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const email = (body.email || '').toLowerCase().trim();
  const code = (body.code || '').trim();
  const newPassword = body.newPassword || '';

  if (!email || !code || !newPassword) {
    return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères` },
      { status: 400 },
    );
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: 'Mot de passe trop long' }, { status: 400 });
  }

  const db = await getD1();
  const user = await db
    .prepare(
      'SELECT id, email, firstName, status, role FROM User WHERE email = ? LIMIT 1',
    )
    .bind(email)
    .first();

  if (!user) {
    return NextResponse.json({ error: 'Email ou code invalide' }, { status: 400 });
  }

  if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
    console.log(`[password-reset] blocked ${user.status} user email=${email}`);
    return NextResponse.json({ error: 'Email ou code invalide' }, { status: 400 });
  }

  // Find latest unused OTP
  const otp = await db
    .prepare(
      `SELECT id, code, expiresAt FROM OtpCode
       WHERE userId = ? AND purpose = 'RESET' AND usedAt IS NULL
       ORDER BY createdAt DESC LIMIT 1`,
    )
    .bind(user.id)
    .first();

  if (!otp) {
    return NextResponse.json(
      { error: 'Aucun code en attente. Demandez un nouveau code.' },
      { status: 400 },
    );
  }
  if (Number(otp.expiresAt) < Date.now()) {
    return NextResponse.json(
      { error: 'Code expiré. Demandez un nouveau code.' },
      { status: 400 },
    );
  }
  if (otp.code !== code) {
    return NextResponse.json({ error: 'Code incorrect' }, { status: 400 });
  }

  // Mark this OTP as used
  await db
    .prepare('UPDATE OtpCode SET usedAt = ? WHERE id = ?')
    .bind(Date.now(), otp.id)
    .run();

  // SECURITY: invalidate all other pending OTPs for this user
  await db
    .prepare('UPDATE OtpCode SET usedAt = ? WHERE userId = ? AND usedAt IS NULL')
    .bind(Date.now(), user.id)
    .run();

  // Update the password + clear any lockout
  // Also set passwordChangedAt to NOW to invalidate all existing sessions
  const passwordHash = await hashPassword(newPassword);
  const now = Date.now();
  await db
    .prepare(
      `UPDATE User SET passwordHash = ?, failedLoginCount = 0, lockedUntil = NULL,
       passwordChangedAt = ?, updatedAt = ?
       WHERE id = ?`,
    )
    .bind(passwordHash, now, now, user.id)
    .run();

  // Send confirmation email
  await sendPasswordChangedEmail(user.email, user.firstName ?? '', ip).catch((e) =>
    console.error('Password change email error:', e),
  );

  console.log(`[password-reset] success email=${email} ip=${ip}`);

  return NextResponse.json({ success: true });
}

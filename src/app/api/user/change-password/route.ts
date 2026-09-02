// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * Change Password — from the user's security settings page
 *
 * D1 direct (was prisma).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { getCurrentUser } from '@/lib/auth';
import { isProduction, getClientIp } from '@/lib/security';
import { sendPasswordChangedEmail } from '@/lib/email';

const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Secure-examanet_session' : 'examanet_session';
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const RATE_LIMIT_MAX = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const _changeAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = _changeAttempts.get(userId);
  if (!entry || entry.resetAt < now) {
    _changeAttempts.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent') || 'Inconnu';

  if (isRateLimited(session.id)) {
    console.log(`[change-password] rate limited userId=${session.id} ip=${ip}`);
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 1 heure.' },
      { status: 429 },
    );
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const currentPassword = body.currentPassword || '';
  const newPassword = body.newPassword || '';

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères` },
      { status: 400 },
    );
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: 'Mot de passe trop long' }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit être différent de l'actuel" },
      { status: 400 },
    );
  }

  const db = await getD1();
  const user = await db
    .prepare(
      'SELECT id, email, firstName, lastName, passwordHash, status, role FROM User WHERE id = ? LIMIT 1',
    )
    .bind(session.id)
    .first();

  if (!user?.passwordHash) {
    return NextResponse.json({ error: 'Compte sans mot de passe (OAuth ?)' }, { status: 400 });
  }

  if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
    console.log(`[change-password] blocked ${user.status} userId=${user.id}`);
    return NextResponse.json({ error: 'Compte non autorisé' }, { status: 403 });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    console.log(`[change-password] wrong current password userId=${user.id} ip=${ip}`);
    return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await db
    .prepare(
      `UPDATE User SET passwordHash = ?, failedLoginCount = 0, lockedUntil = NULL, updatedAt = ?
       WHERE id = ?`,
    )
    .bind(newHash, Date.now(), user.id)
    .run();

  // Invalidate all sessions except the current one
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(SESSION_COOKIE)?.value;

  let sessionsInvalidated = 0;
  if (currentToken) {
    const result = await db
      .prepare('DELETE FROM Session WHERE userId = ? AND token != ?')
      .bind(user.id, currentToken)
      .run();
    sessionsInvalidated = (result as any).meta?.changes ?? result?.changes ?? 0;
  } else {
    const result = await db
      .prepare('DELETE FROM Session WHERE userId = ?')
      .bind(user.id)
      .run();
    sessionsInvalidated = (result as any).meta?.changes ?? result?.changes ?? 0;
  }

  let emailSent = false;
  let emailError: string | null = null;
  try {
    const result = await sendPasswordChangedEmail({
      to: user.email,
      firstName: user.firstName ?? '',
      ip,
      userAgent,
    });
    emailSent = result.success;
    if (!result.success) emailError = result.error || 'unknown error';
  } catch (err: any) {
    emailError = err?.message || 'unknown error';
  }

  return NextResponse.json({
    success: true,
    message: 'Mot de passe changé avec succès',
    emailSent,
    emailError,
    sessionsInvalidated,
  });
}

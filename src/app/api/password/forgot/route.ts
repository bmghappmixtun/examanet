// @ts-nocheck
/**
 * Forgot Password — Step 1: request a reset code
 *
 * Sends an OTP code to the user's email if the account exists.
 * Always returns the same response shape (no email enumeration).
 *
 * D1 direct (was prisma). Per security model, we keep all checks.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction, getClientIp } from '@/lib/security';
import { generateOTP } from '@/lib/auth';
import { sendOTPEmail } from '@/lib/email';

const RESET_EXPIRY_MS = 30 * 60 * 1000;
const RATE_LIMIT_PER_EMAIL = 5;
const RATE_LIMIT_PER_IP = 20;
const RATE_WINDOW_MS = 15 * 60 * 1000;

const _rateStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const entry = _rateStore.get(key);
  if (!entry || entry.resetAt < now) {
    _rateStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

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
  if (!checkRateLimit(`ip:${ip}`, RATE_LIMIT_PER_IP)) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const email = (body.email || '').toLowerCase().trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
  }

  if (!checkRateLimit(`email:${email}`, RATE_LIMIT_PER_EMAIL)) {
    return NextResponse.json(
      { error: 'Trop de tentatives pour cet email. Réessayez dans 15 minutes.' },
      { status: 429 },
    );
  }

  const genericResponse = { success: true, email };

  const db = await getD1();
  const user = await db
    .prepare(
      'SELECT id, email, firstName, status, role FROM User WHERE email = ? LIMIT 1',
    )
    .bind(email)
    .first();

  console.log(
    `[forgot-password] attempt email=${email} ip=${ip} exists=${!!user} status=${user?.status || 'NO_USER'}`,
  );

  if (!user) {
    return NextResponse.json(genericResponse);
  }

  if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
    console.log(`[forgot-password] blocked ${user.status} user email=${email}`);
    return NextResponse.json(genericResponse);
  }

  // Invalidate any previous unused codes
  await db
    .prepare(
      `UPDATE OtpCode SET usedAt = ?
       WHERE userId = ? AND purpose = 'RESET' AND usedAt IS NULL`,
    )
    .bind(Date.now(), user.id)
    .run();

  // Generate and persist OTP
  const code = generateOTP();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO OtpCode (id, userId, code, purpose, expiresAt, createdAt)
       VALUES (?, ?, ?, 'RESET', ?, ?)`,
    )
    .bind(genId(), user.id, code, now + RESET_EXPIRY_MS, now)
    .run();

  // Send email
  const result = await sendOTPEmail(user.email, code, user.firstName ?? undefined);

  console.log(
    `[forgot-password] code sent email=${email} success=${result.success} devMode=${!!result.devCode}`,
  );

  return NextResponse.json({
    success: true,
    email: user.email,
    ...(result.devCode ? { devCode: result.devCode } : {}),
  });
}

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction, rateLimit, getClientIp } from '@/lib/security';
import { generateOTP } from '@/lib/auth';
import { sendOTPEmail } from '@/lib/email';

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

  try {
    // SECURITY: rate limit per IP
    const ip = getClientIp(req);
    const rl = rateLimit(ip, 'resend-otp', 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de demandes. Réessayez dans ${Math.ceil(rl.resetIn / 60000)} minutes.` },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetIn / 1000)) } },
      );
    }

    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const db = await getD1();
    const normalizedEmail = email.toLowerCase();

    const user = await db
      .prepare('SELECT id, status, emailVerifiedAt, email, firstName FROM User WHERE email = ? LIMIT 1')
      .bind(normalizedEmail)
      .first();

    if (user && !user.emailVerifiedAt && user.status === 'PENDING_OTP') {
      // Rate limit: max 1 resend per 30s per user
      const lastOtp = await db
        .prepare(
          `SELECT createdAt FROM OtpCode WHERE userId = ? AND purpose = 'VERIFY'
           ORDER BY createdAt DESC LIMIT 1`,
        )
        .bind(user.id)
        .first();
      if (lastOtp && Number(lastOtp.createdAt) > Date.now() - 30 * 1000) {
        return NextResponse.json({
          success: true,
          message: 'Si votre email est valide et non vérifié, un nouveau code a été envoyé.',
        });
      }

      const otpCode = generateOTP();
      // Expire existing OTPs
      await db
        .prepare(
          `UPDATE OtpCode SET usedAt = ?
           WHERE userId = ? AND purpose = 'VERIFY' AND usedAt IS NULL`,
        )
        .bind(Date.now(), user.id)
        .run();
      // Create new OTP
      const now = Date.now();
      await db
        .prepare(
          `INSERT INTO OtpCode (id, userId, code, purpose, expiresAt, createdAt)
           VALUES (?, ?, ?, 'VERIFY', ?, ?)`,
        )
        .bind(genId(), user.id, otpCode, now + 30 * 60 * 1000, now)
        .run();

      const result = await sendOTPEmail(user.email, otpCode, user.firstName ?? undefined);
      const response: any = {
        success: true,
        message: 'Si votre email est valide et non vérifié, un nouveau code a été envoyé.',
      };
      // SECURITY: Never expose dev code in production
      if (result.devCode && !isProduction()) {
        response.devCode = result.devCode;
        response.devMode = true;
      }
      return NextResponse.json(response);
    }

    // SECURITY: same response shape (anti-enumeration)
    return NextResponse.json({
      success: true,
      message: 'Si votre email est valide et non vérifié, un nouveau code a été envoyé.',
    });
  } catch (e: any) {
    console.error('Resend OTP error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

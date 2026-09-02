// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { hashPassword, generateOTP } from '@/lib/auth';
import { sendOTPEmail, sendWelcomeEmail } from '@/lib/email';
import { notifyAdminsNewTeacher } from '@/lib/admin-notify';

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(req: NextRequest) {
  // SECURITY: CSRF origin check (production only)
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  try {
    const { email, password, firstName, lastName, role = 'STUDENT' } = await req.json();

    if (!email || !password || !firstName) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 6 caractères' },
        { status: 400 },
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }

    const db = await getD1();
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existing = await db
      .prepare('SELECT id, status, emailVerifiedAt, email, firstName FROM User WHERE email = ? LIMIT 1')
      .bind(normalizedEmail)
      .first();

    if (existing) {
      // If user exists but is PENDING_OTP, regenerate OTP
      if (existing.status === 'PENDING_OTP' && !existing.emailVerifiedAt) {
        const otpCode = generateOTP();
        // Expire existing OTPs for this user+purpose
        await db
          .prepare(
            `UPDATE OtpCode SET usedAt = ?
             WHERE userId = ? AND purpose = 'VERIFY' AND usedAt IS NULL`,
          )
          .bind(Date.now(), existing.id)
          .run();
        // Create new OTP
        await db
          .prepare(
            `INSERT INTO OtpCode (id, userId, code, purpose, expiresAt, createdAt)
             VALUES (?, ?, ?, 'VERIFY', ?, ?)`,
          )
          .bind(
            genId(),
            existing.id,
            otpCode,
            Date.now() + 30 * 60 * 1000,
            Date.now(),
          )
          .run();
        sendOTPEmail(existing.email, otpCode, existing.firstName ?? undefined).catch((e) =>
          console.error('Re-OTP error:', e),
        );
      }
      // Same response shape as a fresh registration (anti-enumeration)
      return NextResponse.json({
        success: true,
        requiresVerification: true,
        message: 'Si cet email est valide et non encore vérifié, un code a été envoyé.',
        email: existing.email,
      });
    }

    // Create new user
    const passwordHash = await hashPassword(password);
    const otpCode = generateOTP();
    const userId = genId();
    const now = Date.now();

    await db
      .prepare(
        `INSERT INTO User (
          id, email, passwordHash, firstName, lastName, role, status,
          emailVerifiedAt, slug, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_OTP', NULL, '', ?, ?)`,
      )
      .bind(
        userId,
        normalizedEmail,
        passwordHash,
        firstName,
        lastName || '',
        role,
        now,
        now,
      )
      .run();

    // Create OTP code (30 min expiry)
    await db
      .prepare(
        `INSERT INTO OtpCode (id, userId, code, purpose, expiresAt, createdAt)
         VALUES (?, ?, ?, 'VERIFY', ?, ?)`,
      )
      .bind(genId(), userId, otpCode, now + 30 * 60 * 1000, now)
      .run();

    // Send OTP email
    const otpResult = await sendOTPEmail(normalizedEmail, otpCode, firstName);
    console.log(
      `[register] OTP email result for ${normalizedEmail}: success=${otpResult.success} id=${otpResult.id} devCode=${otpResult.devCode ? 'YES' : 'NO'}`,
    );

    // Send welcome email
    await sendWelcomeEmail(normalizedEmail, firstName, role);

    // If teacher, notify admins in-app
    if (role === 'TEACHER') {
      await notifyAdminsNewTeacher(userId).catch((e) => console.error('Admin notify error:', e));
    }

    // Build response
    const response: any = {
      success: true,
      requiresVerification: true,
      message: 'Compte créé. Un code de vérification a été envoyé à votre email.',
      email: normalizedEmail,
    };

    if (otpResult.devCode) {
      response.devCode = otpResult.devCode;
      response.devMode = true;
      if (!otpResult.success) {
        response.message = `Compte créé. ⚠️ Email non envoyé (${otpResult.error}). En dev, utilisez le code ci-dessous.`;
      }
    }

    return NextResponse.json(response);
  } catch (e: any) {
    console.error('Register error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

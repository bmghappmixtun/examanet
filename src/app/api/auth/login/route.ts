// @ts-nocheck
/**
 * POST /api/auth/login
 * 
 * 2026-08-30: Rewrote using RAW D1 SQL (Drizzle ORM had issues with UPDATE
 * on tables with columns added after schema definition).
 * The user data is in D1, so direct SQL is the most reliable path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { rateLimit, getClientIp } from '@/lib/security';
import bcrypt from 'bcryptjs';
import { setSessionCookie } from '@/lib/auth';

// SECURITY: account lockout thresholds
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

function generateToken() {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
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
    // SECURITY: rate limit per IP
    const ip = getClientIp(req);
    const rl = rateLimit(ip, 'login', 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de tentatives. Réessayez dans ${Math.ceil(rl.resetIn / 60000)} minutes.` },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetIn / 1000)) } },
      );
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
    }

    const db = await getD1();
    const emailLower = email.toLowerCase();

    // User lookup via D1
    const userResult = await db.prepare(
      'SELECT id, email, role, status, passwordHash, failedLoginCount, lockedUntil FROM User WHERE email = ? LIMIT 1'
    ).bind(emailLower).first();
    const user = userResult || null;

    // SECURITY: timing-attack protection — always run a bcrypt compare
    const DUMMY_HASH = '$2a$12$L1vUcRW3YHN.Dqj3oQIc9.d7gO1sZxQfHj9kBrlcFbUkN2VU/LkVu';
    const passwordToCheck = user?.passwordHash || DUMMY_HASH;
    const valid = await bcrypt.compare(password, passwordToCheck);

    // SECURITY: account lockout check
    if (user && user.lockedUntil) {
      const lockedUntilMs = Number(user.lockedUntil); // D1 returns as integer
      if (lockedUntilMs > Date.now()) {
        const remainingMin = Math.ceil((lockedUntilMs - Date.now()) / 60000);
        return NextResponse.json(
          {
            error: `Compte temporairement verrouillé suite à de nombreuses tentatives. Réessayez dans ${remainingMin} minute(s).`,
            code: 'ACCOUNT_LOCKED',
            retryAfter: Math.ceil((lockedUntilMs - Date.now()) / 1000),
          },
          {
            status: 423,
            headers: {
              'Retry-After': String(Math.ceil((lockedUntilMs - Date.now()) / 1000)),
            },
          },
        );
      }
    }

    if (!user || !user.passwordHash || !valid) {
      if (user) {
        const newCount = (user.failedLoginCount || 0) + 1;
        const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
        const lockedUntilTs = shouldLock ? Date.now() + LOCKOUT_DURATION_MS : (Number(user.lockedUntil) || null);
        await db.prepare(
          'UPDATE User SET failedLoginCount = ?, lockedUntil = ?, lastFailedLoginAt = ? WHERE id = ?'
        ).bind(
          shouldLock ? 0 : newCount,
          lockedUntilTs,
          Date.now(),
          user.id
        ).run();
        if (shouldLock) {
          return NextResponse.json(
            {
              error: `Trop de tentatives échouées. Compte verrouillé pendant ${Math.ceil(LOCKOUT_DURATION_MS / 60000)} minutes.`,
              code: 'ACCOUNT_LOCKED',
              retryAfter: Math.ceil(LOCKOUT_DURATION_MS / 1000),
            },
            {
              status: 423,
              headers: { 'Retry-After': String(Math.ceil(LOCKOUT_DURATION_MS / 1000)) },
            },
          );
        }
      }
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
    }

    // SECURITY: reset failed login counter on successful auth
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await db.prepare(
        'UPDATE User SET failedLoginCount = 0, lockedUntil = NULL WHERE id = ?'
      ).bind(user.id).run();
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      return NextResponse.json(
        { error: "Votre compte a été suspendu. Contactez l'administrateur." },
        { status: 403 },
      );
    }

    if (user.status === 'PENDING_APPROVAL') {
      return NextResponse.json(
        {
          error: "Votre compte enseignant est en attente d'approbation par l'administrateur.",
          code: 'PENDING_APPROVAL',
          status: user.status,
          role: user.role,
        },
        { status: 403 },
      );
    }

    if (user.status === 'PENDING_OTP') {
      return NextResponse.json(
        {
          error: 'Veuillez vérifier votre email avec le code OTP.',
          code: 'PENDING_OTP',
          status: user.status,
          role: user.role,
          email: user.email,
        },
        { status: 403 },
      );
    }

    // Create session in D1
    const token = generateToken();
    const expiresAtMs = Date.now() + SESSION_DURATION;
    await db.prepare(
      'INSERT INTO Session (id, userId, token, userAgent, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      generateId(),
      user.id,
      token,
      req.headers.get('user-agent') || null,
      expiresAtMs,
      Date.now()
    ).run();

    // Set cookie
    setSessionCookie(token, new Date(expiresAtMs));

    // Update lastLoginAt
    await db.prepare(
      'UPDATE User SET lastLoginAt = ? WHERE id = ?'
    ).bind(Date.now(), user.id).run();

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        // firstName, lastName, avatarUrl could be fetched separately if needed
      },
    });
  } catch (e: any) {
    console.error('[api/auth/login] error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

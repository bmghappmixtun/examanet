// @ts-nocheck
/**
 * GET /api/auth/magic-link/verify?token=...
 * 
 * 2026-09-09: Verify a magic link token and create a session.
 * - If user exists: log them in
 * - If user doesn't exist: auto-create as STUDENT (or TEACHER if ?role=TEACHER)
 * - Mark token as used
 * - Redirect to home (or callbackUrl)
 */
import { NextRequest, NextResponse } from 'next/server';
import { isProduction, getClientIp } from '@/lib/security';
import { setSessionCookie } from '@/lib/auth';

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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const intendedRole = url.searchParams.get('role') as 'STUDENT' | 'TEACHER' | null;
    const callbackUrl = url.searchParams.get('callbackUrl') || '/';

    if (!token) {
      return NextResponse.redirect(new URL('/connexion?error=missing_token', req.url), 302);
    }

    const db = await getD1();
    const ip = getClientIp(req);

    // Look up token
    const tokenRow: any = await db.prepare(
      'SELECT id, email, expiresAt, used FROM MagicLinkToken WHERE id = ? LIMIT 1'
    ).bind(token).first();

    if (!tokenRow) {
      return NextResponse.redirect(new URL('/connexion?error=invalid_token', req.url), 302);
    }

    if (tokenRow.used === 1) {
      return NextResponse.redirect(new URL('/connexion?error=token_already_used', req.url), 302);
    }

    if (Number(tokenRow.expiresAt) < Date.now()) {
      // Mark as used to prevent replay
      await db.prepare('UPDATE MagicLinkToken SET used = 1 WHERE id = ?').bind(token).run();
      return NextResponse.redirect(new URL('/connexion?error=token_expired', req.url), 302);
    }

    // Mark token as used
    await db.prepare('UPDATE MagicLinkToken SET used = 1 WHERE id = ?').bind(token).run();

    const email = String(tokenRow.email).toLowerCase();

    // Check if user exists
    let user: any = await db.prepare(
      'SELECT id, email, role, status FROM User WHERE email = ? LIMIT 1'
    ).bind(email).first();

    let isNewUser = false;

    if (!user) {
      // Auto-create as STUDENT (or TEACHER)
      const role = intendedRole === 'TEACHER' ? 'TEACHER' : 'STUDENT';
      const newId = generateId();
      const now = Date.now();

      await db.prepare(
        `INSERT INTO User (
          id, email, role, status, emailVerifiedAt,
          firstName, lastName, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        newId,
        email,
        role,
        'ACTIVE', // auto-activate (email is verified via magic link)
        now,
        '', // firstName - user can complete profile later
        '',
        now,
        now,
      ).run();

      user = { id: newId, email, role, status: 'ACTIVE' };
      isNewUser = true;
    } else if (user.status === 'PENDING_OTP') {
      // User registered but never verified OTP — magic link counts as verification
      await db.prepare(
        'UPDATE User SET status = ?, emailVerifiedAt = ? WHERE id = ?'
      ).bind('ACTIVE', Date.now(), user.id).run();
      user.status = 'ACTIVE';
    }

    // Banned/suspended check
    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      return NextResponse.redirect(
        new URL('/connexion?error=account_suspended', req.url),
        302,
      );
    }

    // Pending approval (teachers only)
    if (user.status === 'PENDING_APPROVAL') {
      return NextResponse.redirect(
        new URL('/connexion?error=pending_approval', req.url),
        302,
      );
    }

    // Create session
    const sessionToken = generateToken();
    const expiresAt = Date.now() + SESSION_DURATION;
    await db.prepare(
      'INSERT INTO Session (id, userId, token, userAgent, ipAddress, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      generateId(),
      user.id,
      sessionToken,
      req.headers.get('user-agent') || null,
      ip,
      expiresAt,
      Date.now(),
    ).run();

    // Set cookie
    setSessionCookie(sessionToken, new Date(expiresAt));

    // Update lastLoginAt
    await db.prepare('UPDATE User SET lastLoginAt = ? WHERE id = ?')
      .bind(Date.now(), user.id).run();

    // Build redirect URL
    const finalRedirect = isNewUser
      ? '/profil/completer?welcome=1' // ask user to complete profile
      : callbackUrl;

    return NextResponse.redirect(new URL(finalRedirect, req.url), 302);
  } catch (e: any) {
    console.error('[magic-link/verify] error:', e);
    return NextResponse.redirect(new URL('/connexion?error=server_error', req.url), 302);
  }
}

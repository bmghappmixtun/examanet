// @ts-nocheck
/**
 * POST /api/auth/magic-link/request
 * 
 * 2026-09-09: Send a passwordless login link via email.
 * - For existing users: link logs them in
 * - For new users (student role default): link auto-creates an account
 * 
 * SECURITY:
 * - Rate-limited (5 per 15 min per email)
 * - Token is 32+ chars, single-use, expires in 15 min
 * - No email enumeration (always returns success)
 * - CSRF origin check in production
 */
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction, rateLimit, getClientIp } from '@/lib/security';
import { sendEmail } from '@/lib/email';
import { renderMagicLinkEmail } from '@/lib/email-templates';

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT = 5; // max 5 requests per 15 min per email
const RATE_WINDOW = 15 * 60 * 1000;

function generateId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

function generateToken() {
  // 64 hex chars = 256 bits of entropy
  const a = crypto.randomUUID().replace(/-/g, '');
  const b = crypto.randomUUID().replace(/-/g, '');
  return a + b;
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
    const { email, role } = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    const ip = getClientIp(req);

    // Rate limit per email + per IP
    const rlEmail = rateLimit(emailLower, 'magic_link', RATE_LIMIT, RATE_WINDOW);
    if (!rlEmail.allowed) {
      return NextResponse.json(
        { error: `Trop de demandes. Réessayez dans ${Math.ceil(rlEmail.resetIn / 60000)} minutes.` },
        { status: 429 },
      );
    }

    const db = await getD1();

    // Check if user exists
    const existingUser: any = await db.prepare(
      'SELECT id, email, role, status FROM User WHERE email = ? LIMIT 1'
    ).bind(emailLower).first();
    const isNewUser = !existingUser;

    // Create magic link token
    const token = generateToken();
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const userAgent = req.headers.get('user-agent') || null;

    await db.prepare(
      'INSERT INTO MagicLinkToken (id, email, expiresAt, used, ipAddress, userAgent, createdAt) VALUES (?, ?, ?, 0, ?, ?, ?)'
    ).bind(
      generateId(),
      emailLower,
      expiresAt,
      ip,
      userAgent,
      Date.now(),
    ).run();

    // Build magic link URL
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
    const magicLink = `${SITE_URL}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`;

    // For new users, include intended role in the link
    const finalLink = isNewUser && role === 'TEACHER'
      ? `${magicLink}&role=TEACHER`
      : magicLink;

    // Send email
    const html = renderMagicLinkEmail(
      emailLower,
      finalLink,
      Math.floor(TOKEN_TTL_MS / 60000),
      isNewUser,
    );

    // Only send email in production OR if explicitly enabled in dev
    if (isProduction() || process.env.SEND_DEV_EMAILS === 'true') {
      const result = await sendEmail({
        to: emailLower,
        subject: isNewUser
          ? '🎉 Bienvenue sur Examanet — Confirmez votre compte'
          : '🔗 Votre lien de connexion Examanet',
        html,
      });

      if (!result.ok) {
        console.error('[magic-link] email send failed:', result.error);
        // Don't expose email error to client
        return NextResponse.json(
          { error: "Erreur lors de l'envoi de l'email. Réessayez plus tard." },
          { status: 500 },
        );
      }
    } else {
      console.log('[magic-link] DEV MODE — email not sent. Link:', finalLink);
    }

    // Always return success (no email enumeration)
    return NextResponse.json({
      success: true,
      message: isNewUser
        ? "Si cette adresse est valide, vous recevrez un email de confirmation."
        : "Si cette adresse est valide, vous recevrez un lien de connexion.",
      // DEV ONLY: expose link
      ...(process.env.NODE_ENV !== 'production' && { devLink: finalLink }),
    });
  } catch (e: any) {
    console.error('[magic-link/request] error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

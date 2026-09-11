// @ts-nocheck
/**
 * Auth helpers — D1 direct.
 *
 * 2026-08-30: Rewrote to use raw D1 SQL. The user data lives in D1 (2454 users),
 * but prisma-compat was hitting Neon (Hyperdrive) which has no data.
 * See /api/auth/login and /api/auth/me for the matching endpoint logic.
 */
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

// SECURITY: in production, use the __Secure- prefix to prevent cookie
// injection over insecure channels (e.g. http://). The __Secure- prefix
// requires Secure attribute, blocking any downgrades.
const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Secure-examanet_session' : 'examanet_session';
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function generateId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

/**
 * Create a new session in D1 and return { token, expiresAt }.
 * The session row is keyed by a unique token; the same token is set as a cookie.
 */
export async function createSession(userId: string, userAgent?: string, ipAddress?: string) {
  const db = await getD1();
  const token = crypto.randomUUID() + '-' + crypto.randomUUID();
  const expiresAtMs = Date.now() + SESSION_DURATION;
  await db
    .prepare(
      'INSERT INTO Session (id, userId, token, userAgent, ipAddress, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(generateId(), userId, token, userAgent ?? null, ipAddress ?? null, expiresAtMs, Date.now())
    .run();
  return { token, expiresAt: new Date(expiresAtMs) };
}

/**
 * Look up the active session by cookie token. Returns { token, user, expiresAt } or null.
 * User data comes from D1 (prisma-compat would miss it because it points at Neon).
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getD1();
  const row = await db
    .prepare(
      `SELECT
         s.id as sessionId, s.userId, s.expiresAt as sessionExpiresAt, s.createdAt as sessionCreatedAt,
         u.id, u.email, u.role, u.status, u.firstName, u.lastName, u.firstNameAr, u.lastNameAr,
         u.avatarUrl, u.bio, u.phone, u.website, u.schoolLevel, u.classLevel, u.schoolName, u.schoolNameAr,
         u.governorate, u.diploma, u.isVerifiedTeacher, u.verifiedAt,
         u.numericId, u.slug, u.uploadsCount, u.followersCount,
         u.createdAt, u.updatedAt, u.approvedAt, u.passwordChangedAt
       FROM Session s
       INNER JOIN User u ON s.userId = u.id
       WHERE s.token = ? AND s.expiresAt > ?
         AND (u.passwordChangedAt IS NULL OR s.createdAt > u.passwordChangedAt)
       LIMIT 1`,
    )
    .bind(token, Date.now())
    .first();

  if (!row) return null;
  return {
    token,
    expiresAt: new Date(Number(row.sessionExpiresAt)),
    user: {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      firstName: row.firstName,
      lastName: row.lastName,
      firstNameAr: row.firstNameAr,
      lastNameAr: row.lastNameAr,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      phone: row.phone,
      website: row.website,
      schoolLevel: row.schoolLevel,
      classLevel: row.classLevel,
      schoolName: row.schoolName,
      schoolNameAr: row.schoolNameAr,
      governorate: row.governorate,
      diploma: row.diploma,
      isVerifiedTeacher: !!row.isVerifiedTeacher,
      verifiedAt: row.verifiedAt,
      numericId: row.numericId,
      slug: row.slug,
      uploadsCount: row.uploadsCount || 0,
      followersCount: row.followersCount || 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      approvedAt: row.approvedAt,
    },
  };
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export async function setSessionCookie(token: string, expiresAt: Date | number) {
  const cookieStore = await cookies();
  const expires = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expires,
    path: '/',
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const db = await getD1();
      await db.prepare('DELETE FROM Session WHERE token = ?').bind(token).run();
    } catch {}
  }
  cookieStore.delete(SESSION_COOKIE);
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 2026-09-11: Check if a teacher's profile is complete enough to access
 * /enseignant/* pages. Required fields:
 * - firstName, lastName (identity)
 * - schoolName (teaching context)
 * - governorate (location)
 *
 * Returning false triggers a redirect to /profil/completer in layouts.
 */
export function isTeacherProfileComplete(user: {
  firstName?: string | null;
  lastName?: string | null;
  schoolName?: string | null;
  governorate?: string | null;
}): boolean {
  return Boolean(
    user.firstName &&
      user.lastName &&
      user.schoolName &&
      user.governorate,
  );
}

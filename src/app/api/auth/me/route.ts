// @ts-nocheck
/**
 * GET /api/auth/me
 * 
 * 2026-08-30: Rewrote using RAW D1 SQL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Secure-examanet_session' : 'examanet_session';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const db = await getD1();
    const result = await db.prepare(`
      SELECT 
        u.id, u.email, u.role, u.status, u.firstName, u.lastName, u.avatarUrl,
        u.isVerifiedTeacher, u.governorate, u.classLevel, u.schoolName, u.schoolLevel,
        u.numericId, u.slug, u.uploadsCount, u.followersCount, u.createdAt, u.approvedAt
      FROM User u
      INNER JOIN Session s ON s.userId = u.id
      WHERE s.token = ? AND s.expiresAt > ?
      LIMIT 1
    `).bind(token, Date.now()).first();

    const user = result || null;
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        isVerifiedTeacher: !!user.isVerifiedTeacher,
        governorate: user.governorate,
        classLevel: user.classLevel,
        schoolName: user.schoolName,
        schoolLevel: user.schoolLevel,
        numericId: user.numericId,
        slug: user.slug,
        uploadsCount: user.uploadsCount || 0,
        followersCount: user.followersCount || 0,
        createdAt: user.createdAt,
        approvedAt: user.approvedAt,
      },
    });
  } catch (e: any) {
    console.error('[api/auth/me] error:', e);
    return NextResponse.json({ user: null }, { status: 401 });
  }
}

// @ts-nocheck
/**
 * Short URL for prof profiles: /professeurs/{numericId} (without slug)
 * → real 308 redirect to /professeurs/{numericId}/{slug}
 *
 * Same Etsy-style pattern as resources/[id]. See that file for the rationale
 * of using a route handler instead of a server component page.
 *
 * 2026-08-29: Converted to D1-direct (was prisma, doesn't work on CF Workers).
 * 2026-08-29: Fix locale-preservation in redirect URL (was using absolute path
 * which dropped the /fr/ or /ar/ prefix).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ numericId: string }> }
) {
  const { numericId: numericIdStr } = await params;
  const numericId = parseInt(numericIdStr, 10);
  if (isNaN(numericId) || numericId <= 0) {
    return new NextResponse('Invalid ID', { status: 400 });
  }

  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;

    // Visibility filter matches the full prof page (TEACHER + ACTIVE/verified)
    // (skip the admin preview since getCurrentUser uses prisma - not available on CF Workers)
    const teacher: any = await db.prepare(
      `SELECT slug FROM User
      WHERE numericId = ? AND role = 'TEACHER'
      AND (status = 'ACTIVE' OR isVerifiedTeacher = 1)
      LIMIT 1`
    ).bind(numericId).first();

    if (!teacher) {
      return new NextResponse('Not found', { status: 404 });
    }

    // Extract locale from req.url to preserve it in the redirect
    // req.url is like https://examanet.com/fr/professeurs/15
    // We need to redirect to /fr/professeurs/15/{slug}
    const url = new URL(req.url);
    const locale = url.pathname.split('/')[1]; // 'fr' or 'ar'

    // 308 = Permanent redirect (preserves method, SEO-friendly)
    return NextResponse.redirect(
      new URL(`/${locale}/professeurs/${numericId}/${teacher.slug}`, req.url),
      308
    );
  } catch (e: any) {
    console.error('[teacher short URL] error:', e?.message);
    return new NextResponse('Server error', { status: 500 });
  }
}

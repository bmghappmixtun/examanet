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
 *
 * 2026-09-17 SEO FIX: Accept CUID IDs (e.g. cmr8w1hv70028stsg31b470xh or
 * 4662aab2-c37f-46da-8aeb-82d5411dc562) in addition to numeric IDs.
 * Google indexed 13 /professeurs/<cuid> URLs from the pre-numericId era,
 * all returning 404. We now look up the CUID in D1 to find the numericId
 * and slug, then redirect.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

const CUID_RE = /^(cm[a-z0-9]{20,}|[a-f0-9-]{30,})$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ numericId: string }> }
) {
  const { numericId: idStr } = await params;
  let numericId: number | null = null;

  if (/^\d+$/.test(idStr)) {
    numericId = parseInt(idStr, 10);
  } else if (CUID_RE.test(idStr)) {
    // 2026-09-17: ID is a CUID. Look it up in DB to get numericId.
    try {
      const ctx = await getCloudflareContext({ async: true });
      const db = (ctx as any).env.DB;
      const row: any = await db.prepare(
        `SELECT numericId FROM User WHERE id = ? AND role = 'TEACHER' LIMIT 1`
      ).bind(idStr).first();
      if (row?.numericId) {
        numericId = row.numericId;
      }
    } catch (e: any) {
      console.error('[teacher CUID lookup] error:', e?.message);
    }
  }

  if (numericId === null || numericId <= 0) {
    return new NextResponse('Not found', { status: 404 });
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

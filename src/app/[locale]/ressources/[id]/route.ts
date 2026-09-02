// @ts-nocheck
/**
 * Short URL for resources: /ressources/{numericId} (without slug)
 * → real 308 redirect to /ressources/{numericId}/{slug}
 *
 * 2026-09-02: Migrated from prisma-compat to D1 direct.
 * D1 returns proper data; prisma-compat stub was returning null slug
 * causing redirect to /fr/ressources/{id}/undefined.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId) || numericId <= 0) {
    return new NextResponse('Invalid ID', { status: 400 });
  }

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (!db) {
      return new NextResponse('DB unavailable', { status: 500 });
    }

    // Allow both PUBLISHED and ARCHIVED
    const r: any = await db.prepare(
      "SELECT slug FROM Resource WHERE numericId = ? AND status IN ('PUBLISHED','ARCHIVED') LIMIT 1"
    ).bind(numericId).first();

    if (!r) {
      return new NextResponse('Not found', { status: 404 });
    }

    // 308 = Permanent redirect (preserves method, SEO-friendly)
    return NextResponse.redirect(
      new URL(`/ressources/${numericId}/${r.slug}`, req.url),
      308
    );
  } catch (e) {
    console.error('[ressources/[id] redirect]', e);
    return new NextResponse('Internal error', { status: 500 });
  }
}

// @ts-nocheck
/**
 * Short URL for resources: /ressources/{numericId} (without slug)
 * → real 308 redirect to /ressources/{numericId}/{slug}
 *
 * Implemented as a route handler (route.ts) instead of a server component
 * (page.tsx) so we can return a true HTTP 308 from the server, instead of
 * the fallback client-side meta refresh that page.tsx + redirect() uses
 * during streaming SSR.
 *
 * Result: the browser does ONE request, gets a 308, follows it → single
 * page load, no skeleton flicker, no 2x reload.
 *
 * Pattern: Etsy-style listing URLs — numericId is the stable identifier
 * (never changes), the slug is purely cosmetic for SEO. Slug can be
 * updated later without breaking short links.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

  // Allow both PUBLISHED and ARCHIVED — the full page will show a friendly
  // "this file has been archived" page instead of a hard 404. Only true
  // missing/invalid IDs (no row at all) return 404.
  const resource = await prisma.resource.findFirst({
    where: { numericId, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
    select: { slug: true },
  });
  if (!resource) {
    return new NextResponse('Not found', { status: 404 });
  }

  // 308 = Permanent redirect (preserves method, SEO-friendly)
  return NextResponse.redirect(
    new URL(`/ressources/${numericId}/${resource.slug}`, req.url),
    308
  );
}

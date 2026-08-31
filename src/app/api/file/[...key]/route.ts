// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const BLOB_BASE_URL = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com';
const ALLOWED_PREFIXES = [
  'teacher-library/',
  'concours-9eme/',
  'bac/',
  'resources/',
  'test-',
];

/**
 * GET /api/file/[...key]
 *
 * Public unified file proxy for Examanet. Tries R2 first (newer files),
 * then falls back to Vercel Blob (legacy files). This means:
 *
 *  - New uploads (R2) are served from CF R2 directly through the Worker
 *  - Legacy Vercel Blob URLs (15K+ resources) are also proxied here, so
 *    the browser never hits a third-party Vercel Blob URL
 *  - The token-protected /api/blob-teacher route still exists for the
 *    internal AI extraction pipeline that needs to bypass IP rate limits
 *
 * The key is the path relative to the bucket, e.g.
 * "teacher-library/{teacherId}/{timestamp}-{filename}.pdf".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: keyParts } = await params;
  const key = keyParts.map(decodeURIComponent).join('/');

  // Path-traversal guard
  if (!key || key.includes('..') || key.startsWith('/')) {
    return new NextResponse('Bad request', { status: 400 });
  }

  // Allow-list: only serve files from known namespaces
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    return new NextResponse('Not found', { status: 404 });
  }

  // 1. Try R2 first (fast, CF-native)
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;

  if (bucket) {
    try {
      const obj = await bucket.get(key);
      if (obj) {
        const headers = new Headers();
        headers.set(
          'Content-Type',
          obj.httpMetadata?.contentType || 'application/pdf',
        );
        headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        const fileName = key.split('/').pop() || 'file.pdf';
        headers.set(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(fileName)}"`,
        );
        return new NextResponse(obj.body, { status: 200, headers });
      }
    } catch (e: any) {
      console.error('[api/file] R2 error, falling back to Vercel:', e.message);
    }
  }

  // 2. Fallback: Vercel Blob (legacy files). Fetch and proxy.
  // No internal token required here because this is the public-facing route.
  try {
    const upstreamUrl = `${BLOB_BASE_URL}/${key}`;
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'Examanet/1.0' },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream fetch failed: ${upstream.status}`, {
        status: 502,
      });
    }

    const contentType = upstream.headers.get('content-type') || 'application/pdf';
    const stream = upstream.body;
    if (!stream) {
      return new NextResponse('No body', { status: 502 });
    }

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    return new NextResponse(`Proxy error: ${e.message}`, { status: 502 });
  }
}

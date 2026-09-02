// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_PREFIXES = [
  'teacher-library/',
  'concours-9eme/',
  'bac/',
  'resources/',
  'thumbnails/',
  'test-',
];

/**
 * GET /api/file/[...key]
 *
 * Public unified file proxy for Examanet. R2 only.
 *
 *  - All files (new uploads + legacy Vercel Blob imports) live in R2
 *  - Browser only sees /api/file/{key}, never third-party URLs
 *  - The token-protected /api/blob-teacher route still exists for the
 *    internal AI extraction pipeline that needs to bypass IP rate limits
 *
 * If a file is not in R2, returns 404 — caller must run the migration script.
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

  // Try R2
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;

  if (!bucket) {
    return new NextResponse('Storage not configured', { status: 500 });
  }

  try {
    const obj = await bucket.get(key);
    if (!obj) {
      return new NextResponse('Not found in R2', { status: 404 });
    }

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
  } catch (e: any) {
    console.error('[api/file] R2 error:', e.message);
    return new NextResponse(`R2 error: ${e.message}`, { status: 502 });
  }
}

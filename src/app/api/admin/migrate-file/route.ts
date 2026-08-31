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
 * POST /api/admin/migrate-file
 *
 * One-off migration endpoint: fetches a file from any upstream URL (Vercel Blob, bacweb.tn, etc.)
 * and uploads it to R2.
 *
 * Body: { key: string, url: string }
 *   - key: the path where the file will be stored in R2
 *   - url: the upstream URL to fetch from
 *
 * Auth: Authorization: Bearer <MIGRATE_TOKEN> (env var on the Worker)
 *
 * Returns:
 *   200 {status:"migrated",size:12345} if uploaded
 *   200 {status:"already-in-r2"} if R2 already has the file
 *   404 {status:"not-found",upstreamStatus:404} if upstream returns 404
 *   502 if upstream fetch fails
 *   500 on internal error
 */
export async function POST(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const expected = process.env.MIGRATE_TOKEN;
  if (!expected) {
    return new NextResponse('MIGRATE_TOKEN not configured', { status: 500 });
  }
  if (token !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Parse body
  let body: { key?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return new NextResponse('Invalid JSON body', { status: 400 });
  }

  const { key, url } = body;
  if (!key || !url) {
    return new NextResponse('Bad request: key and url required', { status: 400 });
  }
  if (key.includes('..') || key.startsWith('/')) {
    return new NextResponse('Bad request: invalid key', { status: 400 });
  }
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    return new NextResponse('Forbidden key prefix', { status: 400 });
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return new NextResponse('Bad request: invalid url', { status: 400 });
  }

  // Get R2 bucket
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;
  if (!bucket) {
    return new NextResponse('R2 bucket not configured', { status: 500 });
  }

  // 1. Check if R2 already has the file
  try {
    const existing = await bucket.head(key);
    if (existing) {
      return NextResponse.json({ status: 'already-in-r2', size: existing.size });
    }
  } catch (e: any) {
    console.error('[migrate-file] R2 head error:', e.message);
  }

  // 2. Fetch from upstream
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { 'User-Agent': 'Examanet-Migration/1.0' },
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', error: `Upstream fetch failed: ${e.message}` }, { status: 502 });
  }

  if (upstream.status === 404) {
    return NextResponse.json({ status: 'not-found', upstreamStatus: 404 }, { status: 404 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ status: 'error', error: `Upstream returned ${upstream.status}` }, { status: 502 });
  }

  if (!upstream.body) {
    return NextResponse.json({ status: 'error', error: 'Upstream returned no body' }, { status: 502 });
  }

  // 3. Upload to R2
  const contentType = upstream.headers.get('content-type') || 'application/pdf';
  try {
    await bucket.put(key, upstream.body, {
      httpMetadata: { contentType },
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', error: `R2 put failed: ${e.message}` }, { status: 502 });
  }

  // 4. Verify
  const head = await bucket.head(key);
  return NextResponse.json({
    status: 'migrated',
    size: head?.size,
    contentType,
  });
}

/**
 * GET /api/admin/migrate-file?key=X
 * Just checks if the file is in R2.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'key required' }, { status: 400 });
  }

  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;
  if (!bucket) {
    return NextResponse.json({ error: 'R2 not configured' }, { status: 500 });
  }

  try {
    const head = await bucket.head(key);
    if (head) {
      return NextResponse.json({ inR2: true, size: head.size, contentType: head.httpMetadata?.contentType });
    }
    return NextResponse.json({ inR2: false }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

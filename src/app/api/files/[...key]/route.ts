// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';

/**
 * GET /api/files/[...key]
 * Serves files from R2 (PDFS_BUCKET) — public proxy for teacher library files.
 *
 * This route is used as the fileUrl in TeacherFile records so PDFs uploaded
 * to R2 are publicly accessible (R2 alone isn't public; the Worker proxies it).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;
  if (!bucket) {
    return new Response('Storage not configured', { status: 500 });
  }

  const { key: keyParts } = await params;
  const key = keyParts.join('/');
  if (!key || key.includes('..')) {
    return new Response('Bad request', { status: 400 });
  }

  const obj = await bucket.get(key);
  if (!obj) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/pdf');
  headers.set('Cache-Control', 'public, max-age=3600');
  if (obj.httpMetadata?.contentDisposition) {
    headers.set('Content-Disposition', obj.httpMetadata.contentDisposition);
  } else {
    // Default: inline (so browser PDF viewer works)
    const fileName = key.split('/').pop() || 'file.pdf';
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  }

  return new Response(obj.body, { headers });
}

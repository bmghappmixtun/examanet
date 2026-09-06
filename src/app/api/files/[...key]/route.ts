// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';

/**
 * GET /api/files/[...key]
 * Serves files from R2 (PDFS_BUCKET) — public proxy for teacher library files.
 *
 * 2026-09-06: Fixed missing Content-Length and Accept-Ranges headers.
 * Chrome's built-in PDF viewer needs these to render the file properly.
 * Without Content-Length, it sometimes shows 'Invalid PDF structure' even
 * when the PDF is structurally valid (we confirmed via `file` command).
 *
 * Supports Range requests for progressive loading.
 */
export async function GET(
  req: NextRequest,
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

  // Determine file metadata
  const contentType = obj.httpMetadata?.contentType || 'application/pdf';
  const fileName = key.split('/').pop() || 'file.pdf';
  const fileSize = obj.size;

  // Handle Range request (Chrome uses this for PDF streaming)
  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      const rangeLength = end - start + 1;
      const rangeObj = await bucket.get(key, {
        range: { offset: start, length: rangeLength },
      });
      if (rangeObj) {
        // 2026-09-06: R2 SDK's rangeObj.size returns the TOTAL object size
        // (not the range size), so we use the calculated rangeLength instead.
        // Otherwise Content-Length is wrong and Chrome's PDF viewer
        // sees a mismatch between headers and body.
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Content-Length', String(rangeLength));
        headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
        headers.set('Cache-Control', 'public, max-age=3600');
        return new Response(rangeObj.body, { status: 206, headers });
      }
    }
  }

  // Full file response
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Length', String(fileSize));
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=3600');
  if (obj.httpMetadata?.contentDisposition) {
    headers.set('Content-Disposition', obj.httpMetadata.contentDisposition);
  } else {
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  }

  return new Response(obj.body, { headers });
}

// @ts-nocheck
/**
 * Upload pre-generated thumbnail JPEG.
 *
 * Used by the Python worker that renders PDFs with pymupdf.
 * The worker downloads PDFs, generates JPEGs locally, and POSTs the JPEG
 * bytes here for upload to R2.
 *
 * POST /api/admin/upload-thumbnail
 * Headers:
 *   X-Internal-Token: devmanet-bulk-2026
 * Body: { resourceId, jpegBase64, fileKey }
 *
 * Returns: { thumbnailKey, thumbnailUrl }
 *
 * 2026-09-07: Migrated from Vercel Blob to R2 (Phase 9).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/d1-admin';
import { uploadFile } from '@/lib/storage';

const INTERNAL_TOKEN = process.env.INTERNAL_BULK_TOKEN || 'devmanet-bulk-2026';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-internal-token');
  if (token !== INTERNAL_TOKEN) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const body = await req.json();
    const { resourceId, jpegBase64, fileKey } = body;
    
    if (!resourceId || !jpegBase64 || !fileKey) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    
    // Type narrowing for TypeScript
    const rid: string = String(resourceId);

    // Decode base64 JPEG
    const jpegBuffer = Buffer.from(jpegBase64, 'base64');
    
    // Sanitize filename
    const safeName = fileKey.replace(/[^a-zA-Z0-9.-]/g, '_');
    const pathname = `thumbnails/${safeName}-${Date.now()}.jpg`;

    // 2026-09-07: R2 migration — use uploadFile (was put() to Vercel Blob)
    const result = await uploadFile(pathname, jpegBuffer, 'image/jpeg');

    // Update DB (already d1-admin)
    await db.resource.update({
      where: { id: rid },
      data: { thumbnailKey: result.key, thumbnailUrl: result.url },
    });

    return NextResponse.json({
      status: 'ok',
      thumbnailKey: result.key,
      thumbnailUrl: result.url,
      size: jpegBuffer.length,
    });
  } catch (e: any) {
    console.error('upload-thumbnail error:', e);
    return NextResponse.json({ status: 'error', error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-internal-token');
  if (token !== INTERNAL_TOKEN) {
    return new NextResponse('Not found', { status: 404 });
  }
  // Count without thumbnailKey (null or empty string)
  const allResources = await db.resource.findMany({
    where: { fileKey: { not: '' } },
    select: { id: true, thumbnailKey: true },
  });
  const total = allResources.filter((r: any) => !r.thumbnailKey).length;
  const withThumb = allResources.length - total;
  return NextResponse.json({
    without_thumbnail: total,
    with_thumbnail: withThumb,
    total: withThumb + total,
    percent: Math.round(withThumb * 100 / (withThumb + total)),
  });
}

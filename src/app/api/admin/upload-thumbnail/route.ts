// @ts-nocheck
/**
 * Upload pre-generated thumbnail JPEG.
 *
 * Used by the Python worker that renders PDFs with pymupdf.
 * The worker downloads PDFs, generates JPEGs locally, and POSTs the JPEG
 * bytes here for upload to Vercel Blob.
 *
 * POST /api/admin/upload-thumbnail
 * Headers:
 *   X-Internal-Token: devmanet-bulk-2026
 * Body: { resourceId, jpegBase64, fileKey }
 *
 * Returns: { thumbnailKey, thumbnailUrl }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';

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

    // Upload to Vercel Blob (OIDC auto on Vercel)
    const blob = await put(pathname, jpegBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
    });

    // Update DB
    await prisma.resource.update({
      where: { id: rid },
      data: { thumbnailKey: blob.pathname, thumbnailUrl: blob.url },
    });

    return NextResponse.json({
      status: 'ok',
      thumbnailKey: blob.pathname,
      thumbnailUrl: blob.url,
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
  const allResources = await prisma.resource.findMany({
    where: { fileKey: { not: '' } },
    select: { id: true, thumbnailKey: true },
  });
  const total = allResources.filter(r => !r.thumbnailKey).length;
  const withThumb = allResources.length - total;
  return NextResponse.json({
    without_thumbnail: total,
    with_thumbnail: withThumb,
    total: withThumb + total,
    percent: Math.round(withThumb * 100 / (withThumb + total)),
  });
}

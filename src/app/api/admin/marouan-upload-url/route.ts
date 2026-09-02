import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { url, pathname } = await req.json();
    
    if (!url || !pathname) {
      return NextResponse.json({ error: 'url and pathname required' }, { status: 400 });
    }

    // Download from URL with no body size limit
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json({ error: `Download failed: ${response.status}` }, { status: 500 });
    }
    
    if (!response.body) {
      return NextResponse.json({ error: 'No response body' }, { status: 500 });
    }

    // Get content type and size
    const contentType = response.headers.get('content-type') || 'application/pdf';
    const contentLength = response.headers.get('content-length');
    
    // Upload to Vercel Blob using a stream (no body size limit on download)
    const blob = await put(pathname, response.body, {
      access: 'public',
      contentType,
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      key: blob.pathname,
      contentLength: contentLength ? parseInt(contentLength) : null,
      contentType,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}

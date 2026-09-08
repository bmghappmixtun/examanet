import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/storage';

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

    // Download from URL
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json({ error: `Download failed: ${response.status}` }, { status: 500 });
    }
    
    if (!response.body) {
      return NextResponse.json({ error: 'No response body' }, { status: 500 });
    }

    // Get content type
    const contentType = response.headers.get('content-type') || 'application/pdf';
    
    // 2026-09-07: R2 migration — use uploadFile (was put() to Vercel Blob)
    const buffer = Buffer.from(await response.arrayBuffer());
    const result = await uploadFile(pathname, buffer, contentType);

    return NextResponse.json({
      success: true,
      url: result.url,
      key: result.key,
      contentLength: buffer.length,
      contentType,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}

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
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const pathname = (formData.get('pathname') as string) || file?.name;
    
    if (!file) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }

    // Use a stream to upload to Vercel Blob (bypasses 4.5MB function payload limit)
    // The @vercel/blob put() function can accept a ReadableStream
    const blob = await put(pathname || file.name, file.stream(), {
      access: 'public',
      contentType: file.type || 'application/pdf',
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      key: blob.pathname,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

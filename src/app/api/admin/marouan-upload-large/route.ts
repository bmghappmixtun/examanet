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
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const pathname = (formData.get('pathname') as string) || file?.name;
    
    if (!file) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }

    // 2026-09-07: R2 migration — use uploadFile (was put() to Vercel Blob)
    // Read the file as ArrayBuffer to bypass formData size limits
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/pdf';
    const result = await uploadFile(pathname || file.name, buffer, contentType);

    return NextResponse.json({
      success: true,
      url: result.url,
      key: result.key,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

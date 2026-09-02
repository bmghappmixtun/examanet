import { NextRequest, NextResponse } from 'next/server';
import { cachedSearchV2 } from '@/lib/search-v2-d1';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    // 2026-07-30: use cachedSearchV2 to share results across users (60s TTL)
    const data = await cachedSearchV2({
      q: p.get('q') || '',
      page: parseInt(p.get('page') || '1'),
      limit: parseInt(p.get('limit') || '20'),
      sort: (p.get('sort') as any) || 'relevance',
      filters: {
        subject: p.getAll('subject').filter(Boolean),
        class: p.getAll('class').filter(Boolean),
        section: p.getAll('section').filter(Boolean),
        type: p.getAll('type').filter(Boolean),
        year: p.getAll('year').filter(Boolean),
        trimester: p.getAll('trimestre').filter(Boolean),
        language: p.getAll('language').filter(Boolean),
        hasCorrection: p.get('hasCorrection') === 'true' ? true : undefined,
        teacherId: p.get('teacherId') || undefined,
      },
    });
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[search v2]', e);
    return NextResponse.json(
      { error: 'Search failed', message: e.message?.slice(0, 500) },
      { status: 500 },
    );
  }
}

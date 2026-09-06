import { NextRequest, NextResponse } from 'next/server';
import { cachedSearchV2 } from '@/lib/search-v2-d1';
import { rateLimitKv, rateLimitResponse } from '@/lib/rate-limit-kv';
import { logSearchRequest } from '@/lib/search-logger';
import { getClientIp } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // 2026-09-07: Rate limit per IP — 30 req/min
  // Blocks bot traffic hammering /recherche (7,448 visitors in 7d, 99.93% desktop bots)
  const rl = await rateLimitKv(req, 'search-v2', 30, 60 * 1000);
  if (!rl.allowed) {
    const ua = req.headers.get('user-agent') || 'unknown';
    console.log(`[search-v2] rate-limited IP=${getClientIp(req)} UA="${ua.slice(0, 80)}"`);
    logSearchRequest({
      endpoint: 'search-v2',
      request: req,
      query: p?.get?.('q') || '',
      status: 429,
      durationMs: 0,
    }).catch(() => {});
    return rateLimitResponse(rl);
  }

  const p = req.nextUrl.searchParams;
  const startTime = Date.now();
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
    // Log success
    logSearchRequest({
      endpoint: 'search-v2',
      request: req,
      query: p.get('q') || '',
      status: 200,
      durationMs: Date.now() - startTime,
    }).catch(() => {});
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[search v2]', e);
    logSearchRequest({
      endpoint: 'search-v2',
      request: req,
      query: p.get('q') || '',
      status: 500,
      durationMs: Date.now() - startTime,
    }).catch(() => {});
    return NextResponse.json(
      { error: 'Search failed', message: e.message?.slice(0, 500) },
      { status: 500 },
    );
  }
}

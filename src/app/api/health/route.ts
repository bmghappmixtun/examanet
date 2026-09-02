import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * PERF 2026-09-02: Replaced Prisma/Hyperdrive with D1 direct
 * 
 * Previous version: 80% error rate due to Prisma + Hyperdrive issues
 * Now: Direct D1 queries via getCloudflareContext
 */
export async function GET() {
  try {
    // Use a try/catch around the dynamic import (CF Workers can have
    // module loading race conditions on cold start)
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = ctx.env?.DB;
    
    if (!db) {
      return NextResponse.json({ ok: false, error: 'DB not bound' }, { status: 503 });
    }
    
    // Run 2 simple count queries (D1 is reliable, fast)
    const start = Date.now();
    const countAll: any = await db.prepare('SELECT COUNT(*) as c FROM Resource').first();
    const countPublished: any = await db.prepare("SELECT COUNT(*) as c FROM Resource WHERE status = 'PUBLISHED'").first();
    const sample: any = await db.prepare("SELECT title FROM Resource WHERE status = 'PUBLISHED' LIMIT 1").first();
    const latency = Date.now() - start;
    
    return NextResponse.json({
      ok: true,
      platform: 'cloudflare-workers',
      db: {
        ok: true,
        latency,
        countAll: countAll?.c || 0,
        countPublished: countPublished?.c || 0,
        sampleTitle: sample?.title?.slice(0, 50) || null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message || String(e),
    }, { status: 503 });
  }
}

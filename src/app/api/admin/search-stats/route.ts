// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/search-stats
 * 
 * Returns search request log stats. Admin only.
 * Shows top IPs, top UAs, top queries, status distribution.
 * Used to identify bot patterns and tune rate limits.
 * 
 * Query params:
 *   ?since=<ms timestamp> (default: 24h ago)
 *   ?limit=<n> (default: 50)
 *   ?endpoint=<search-v2|search-suggest|search-resources>
 *   ?status=<200|429|500>
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const params = req.nextUrl.searchParams;
    const since = parseInt(params.get('since') || '') || Date.now() - 24 * 60 * 60 * 1000;
    const limit = Math.min(parseInt(params.get('limit') || '50'), 200);
    const endpointFilter = params.get('endpoint');
    const statusFilter = parseInt(params.get('status') || '0');

    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (!db) {
      return NextResponse.json({ error: 'DB not available' }, { status: 503 });
    }

    // Build WHERE clause
    const where = ['createdAt >= ?'];
    const binds: any[] = [since];
    if (endpointFilter) {
      where.push('endpoint = ?');
      binds.push(endpointFilter);
    }
    if (statusFilter) {
      where.push('responseStatus = ?');
      binds.push(statusFilter);
    }
    const whereSql = where.join(' AND ');

    // 1. Top IPs
    const topIps: any = await db
      .prepare(
        `SELECT ipAddress, COUNT(*) as n, userAgent
         FROM SearchRequestLog
         WHERE ${whereSql}
         GROUP BY ipAddress
         ORDER BY n DESC
         LIMIT ?`
      )
      .bind(...binds, limit)
      .all();

    // 2. Top UAs (by frequency)
    const topUas: any = await db
      .prepare(
        `SELECT userAgent, COUNT(*) as n
         FROM SearchRequestLog
         WHERE ${whereSql}
         GROUP BY userAgent
         ORDER BY n DESC
         LIMIT ?`
      )
      .bind(...binds, limit)
      .all();

    // 3. Status distribution
    const statusDist: any = await db
      .prepare(
        `SELECT responseStatus, COUNT(*) as n
         FROM SearchRequestLog
         WHERE ${whereSql}
         GROUP BY responseStatus
         ORDER BY n DESC`
      )
      .bind(...binds)
      .all();

    // 4. Top queries
    const topQueries: any = await db
      .prepare(
        `SELECT query, COUNT(*) as n
         FROM SearchRequestLog
         WHERE ${whereSql} AND query != ''
         GROUP BY query
         ORDER BY n DESC
         LIMIT ?`
      )
      .bind(...binds, limit)
      .all();

    // 5. Endpoint distribution
    const endpointDist: any = await db
      .prepare(
        `SELECT endpoint, COUNT(*) as n
         FROM SearchRequestLog
         WHERE ${whereSql}
         GROUP BY endpoint
         ORDER BY n DESC`
      )
      .bind(...binds)
      .all();

    // 6. Total count
    const total: any = await db
      .prepare(`SELECT COUNT(*) as n FROM SearchRequestLog WHERE ${whereSql}`)
      .bind(...binds)
      .first();

    return NextResponse.json({
      total: total?.n || 0,
      since,
      until: Date.now(),
      endpointDist: (endpointDist?.results || []).map((r: any) => ({ endpoint: r.endpoint, count: r.n })),
      statusDist: (statusDist?.results || []).map((r: any) => ({ status: r.responseStatus, count: r.n })),
      topIps: (topIps?.results || []).map((r: any) => ({ ip: r.ipAddress, count: r.n, ua: r.userAgent })),
      topUas: (topUas?.results || []).map((r: any) => ({ ua: r.userAgent, count: r.n })),
      topQueries: (topQueries?.results || []).map((r: any) => ({ query: r.query, count: r.n })),
    });
  } catch (e: any) {
    console.error('[admin/search-stats] error:', e);
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 });
  }
}

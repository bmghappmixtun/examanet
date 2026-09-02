// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { d1All, d1First } from '@/lib/db-d1';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/logs
 *
 * Live view of Vercel runtime logs stored from the log drain.
 * Uses raw D1 SQL (D1 VercelLog table has no Prisma schema yet).
 *
 * Query params:
 * - level: filter by level (error, warning, info) - uses statusCode as proxy
 * - since: ISO timestamp (default: 1h ago)
 * - until: ISO timestamp (default: now)
 * - limit: max results (default 50, max 500)
 * - path: filter by request path (contains)
 * - source: 'vercellog' (default) or 'errorlog'
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const url = new URL(req.url);
  const level = url.searchParams.get('level');
  const sinceParam = url.searchParams.get('since');
  const untilParam = url.searchParams.get('until');
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '50'));
  const pathFilter = url.searchParams.get('path');
  const source = url.searchParams.get('source') || 'vercellog';

  const since = sinceParam ? new Date(sinceParam).getTime() : Date.now() - 60 * 60 * 1000;
  const until = untilParam ? new Date(untilParam).getTime() : Date.now();

  try {
    let logs: any[] = [];
    let counts: { level: string; count: number }[] = [];

    if (source === 'errorlog') {
      // Query ErrorLog table
      const conditions = ['createdAt BETWEEN ? AND ?'];
      const params: any[] = [since, until];
      if (level) {
        conditions.push('level = ?');
        params.push(level);
      }
      if (pathFilter) {
        conditions.push('url LIKE ?');
        params.push(`%${pathFilter}%`);
      }
      logs = await d1All(
        `SELECT id, source, level, message, url, method, statusCode, createdAt
         FROM ErrorLog
         WHERE ${conditions.join(' AND ')}
         ORDER BY createdAt DESC
         LIMIT ?`,
        ...params, limit,
      );
      const countRows: any[] = await d1All(
        `SELECT level, COUNT(*) as count FROM ErrorLog
         WHERE createdAt BETWEEN ? AND ?
         GROUP BY level`,
        since, until,
      );
      counts = countRows.map((c: any) => ({ level: c.level, count: Number(c.count) }));
    } else {
      // Query VercelLog table
      const conditions = ['createdAt BETWEEN ? AND ?'];
      const params: any[] = [since, until];
      if (level === 'error') {
        conditions.push('(responseStatusCode >= 400)');
      }
      if (pathFilter) {
        conditions.push('requestPath LIKE ?');
        params.push(`%${pathFilter}%`);
      }
      logs = await d1All(
        `SELECT id, requestId, requestPath, requestMethod, responseStatusCode,
                userAgent, ipAddress, country, region, city, durationMs, createdAt
         FROM VercelLog
         WHERE ${conditions.join(' AND ')}
         ORDER BY createdAt DESC
         LIMIT ?`,
        ...params, limit,
      );
      // Add level computed from statusCode
      logs = logs.map((l: any) => ({
        ...l,
        level: l.responseStatusCode >= 500 ? 'error' : l.responseStatusCode >= 400 ? 'warning' : 'info',
        timestamp: l.createdAt,
      }));
      const countRows: any[] = await d1All(
        `SELECT 
           CASE 
             WHEN responseStatusCode >= 500 THEN 'error'
             WHEN responseStatusCode >= 400 THEN 'warning'
             ELSE 'info'
           END as level,
           COUNT(*) as count
         FROM VercelLog
         WHERE createdAt BETWEEN ? AND ?
         GROUP BY level`,
        since, until,
      );
      counts = countRows.map((c: any) => ({ level: c.level, count: Number(c.count) }));
    }

    return NextResponse.json({
      ok: true,
      source,
      range: { since: new Date(since).toISOString(), until: new Date(until).toISOString() },
      counts,
      logs,
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Query failed', detail: e.message }, { status: 500 });
  }
}

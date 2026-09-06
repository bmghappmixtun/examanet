// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { d1Run, genId } from '@/lib/db-d1';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Vercel Log Drain endpoint — DEPRECATED as of 2026-09-05.
 *
 * Receives all runtime logs (stdout, stderr) from Vercel and stores them
 * in the database for live monitoring. Security: Protected by a shared
 * secret (LOG_DRAIN_SECRET).
 *
 * 2026-09-05: SUPERSEDED by /api/cron/cf-observability-sync which reads
 * server logs from Cloudflare Observability instead. This route is kept
 * for backward compatibility (Vercel may still be sending some logs during
 * the transition period) but is no longer the primary log ingestion path.
 *
 * 2026-09-06: Rewrote to use raw D1 (was using the broken d1-admin stub
 * with db.vercelLog.createMany which threw "no such table" errors after
 * the rename to CloudflareLog).
 *
 * Scheduled removal: Phase 9 (Vercel shutdown).
 */
export async function POST(req: NextRequest) {
  // Auth: check the secret token
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('x-drain-token');
  const expectedToken = process.env.LOG_DRAIN_SECRET || process.env.SEED_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const logs = Array.isArray(body) ? body : [body];

    if (logs.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    // Map Vercel log format to our schema (only errors and warnings).
    // CRITICAL (2026-08-16): Vercel's runtime emits `START RequestId: ...` and
    // `END RequestId: ...` log lines at the `warning` level. Capturing those
    // caused a flood of ~57 noise rows/day and contributed to the 28M
    // Observability Events ($31.01) on the Aug-2026 Vercel bill.
    //
    // We now:
    // 1. Only keep `error` level (warnings filtered out — too noisy)
    // 2. Explicitly drop Vercel runtime lifecycle logs (START/END/REPORT)
    // 3. Drop health checks (we have a dedicated /api/health)
    // 4. Drop our own log-drain logs (avoid recursion)
    const rows = logs
      .filter((log: any) => {
        if (log.level !== 'error') return false;
        const msg = typeof log.message === 'string' ? log.message : JSON.stringify(log.message || '');
        // Drop Vercel runtime lifecycle noise
        if (/^(START|END|REPORT) RequestId:/.test(msg)) return false;
        // Drop health-check pings
        if (log.requestPath === '/api/health' || log.requestPath === '/api/cron/health') return false;
        // Drop our own drain processing logs (avoid infinite recursion)
        if (log.requestPath === '/api/log-drain') return false;
        // Drop expected 404s on static assets
        if (log.responseStatusCode === 404 && /\.(js|css|ico|png|svg|woff2?|map)$/.test(log.requestPath || '')) return false;
        return true;
      })
      .map((log: any) => ({
        externalId: log.id || `${log.deploymentId}-${log.timestamp}`,
        level: log.level,
        deploymentId: log.deploymentId,
        source: log.source || 'vercel',
        domain: log.domain,
        requestMethod: log.requestMethod,
        requestPath: log.requestPath,
        responseStatusCode: log.responseStatusCode,
        message: typeof log.message === 'string'
          ? log.message.slice(0, 4000)
          : JSON.stringify(log.message || log).slice(0, 4000),
        projectId: log.projectId,
        environment: log.environment,
        branch: log.branch,
        cache: log.cache,
        requestId: log.requestId,
        createdAt: log.timestamp || log.date || Date.now(),
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, count: 0, skipped: logs.length });
    }

    // Bulk insert with duplicate handling (INSERT OR IGNORE)
    let stored = 0;
    for (const row of rows) {
      const r: any = await d1Run(
        `INSERT OR IGNORE INTO CloudflareLog
         (id, requestId, requestPath, requestMethod, responseStatusCode,
          level, message, source, externalId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        genId(),
        row.requestId,
        row.requestPath,
        row.requestMethod,
        row.responseStatusCode,
        row.level,
        row.message,
        row.source,
        row.externalId,
        row.createdAt,
      );
      if (r?.meta?.changes > 0) stored++;
    }

    return NextResponse.json({
      ok: true,
      received: logs.length,
      stored,
      skipped: logs.length - rows.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

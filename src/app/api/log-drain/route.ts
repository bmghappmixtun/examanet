// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Vercel Log Drain endpoint
 * 
 * Receives all runtime logs (stdout, stderr) from Vercel and stores them
 * in the database for live monitoring.
 * 
 * Security: Protected by a shared secret (LOG_DRAIN_SECRET). Vercel
 * configures the drain URL with a token in the path/query to prevent
 * unauthorized access.
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
      .filter(log => {
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
      .map(log => ({
        externalId: log.id || `${log.deploymentId}-${log.timestamp}`,
        timestamp: new Date(log.timestamp || log.date || Date.now()),
        level: log.level as 'error' | 'warning' | 'info',
        deploymentId: log.deploymentId,
        source: log.source,
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
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, count: 0, skipped: logs.length });
    }

    // Bulk insert with duplicate handling
    const result = await prisma.vercelLog.createMany({
      data: rows,
      skipDuplicates: true,
    });

    return NextResponse.json({ 
      ok: true, 
      received: logs.length,
      stored: result.count,
      skipped: logs.length - rows.length,
    });
  } catch (e) {
    console.error('[api/log-drain] Error processing log drain:', e);
    return NextResponse.json({ 
      error: 'Processing failed',
      detail: (e as Error).message,
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('x-drain-token');
  const expectedToken = process.env.LOG_DRAIN_SECRET || process.env.SEED_TOKEN;
  
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ 
    ok: true,
    endpoint: 'log-drain',
    purpose: 'Vercel runtime log ingestion',
  });
}

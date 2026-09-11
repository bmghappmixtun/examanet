// @ts-nocheck
/**
 * /api/cron/cf-observability-sync
 *
 * 2026-09-05: Sync Cloudflare Workers Observability events to D1 CloudflareLog
 * (replacing the now-defunct Vercel Log Drain which went silent when we
 * migrated off Vercel).
 *
 * The /admin/erreurs page reads from CloudflareLog. Before this cron, that
 * table was empty (0 rows) and the page showed nothing under
 * "Source: CloudflareLog".
 *
 * Called by the CF Cron trigger every 5 minutes.
 * Fetches the last 5 minutes of worker events with level=error and writes
 * them to D1. Uses a unique externalId (sha256 hash of timestamp+requestId
 * +message) so re-running the cron is idempotent — duplicates are silently
 * rejected by the UNIQUE INDEX.
 *
 * Auth: CRON_SECRET in Authorization header or ?secret= query.
 */

import { NextRequest, NextResponse } from 'next/server';
import { d1All, d1Run, genId } from '@/lib/db-d1';
import { requireCronSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_MIN = 30; // 30 min overlap so missed runs catch up
const MAX_EVENTS = 200; // per sync run

interface CfObservabilityEvent {
  timestamp: string;
  $metadata?: { level?: string; service?: string };
  source?: {
    message?: string;
    error?: { message?: string; stack?: string };
    requestPath?: string;
    requestMethod?: string;
    responseStatusCode?: number;
    durationMs?: number;
    userAgent?: string;
    ipAddress?: string;
    country?: string;
    region?: string;
    city?: string;
  };
}

export async function GET(req: NextRequest) {
  // Auth (uses cf-auth helper: CF env → process.env → devDefault)
  const authErr = await requireCronSecret(req, { devDefault: 'monitor-secret' });
  if (authErr) return authErr;

  // One-time backfill mode: ?backfill=24 (hours)
  const url = new URL(req.url);
  const backfillHours = parseInt(url.searchParams.get('backfill') || '0');
  const windowMin = backfillHours > 0 ? backfillHours * 60 : WINDOW_MIN;

  // 2026-09-11: Use getCloudflareContext() for CF secrets (process.env was undefined
  // for wrangler secret put values, which broke the cron sync since v#493).
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const env = (ctx as any).env as Record<string, string> | undefined;
  const accountId = env?.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '59cffdeaadf3809cc3d2039c43f836e0';
  const apiToken = env?.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  const workerName = 'examanet-prod';

  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: 'CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set' },
      { status: 500 },
    );
  }

  try {
    const now = Date.now();
    const from = now - windowMin * 60 * 1000;

    // Query CF Workers Observability REST API
    const resp = await fetch(
      'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/workers/observability/telemetry/query',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queryId: 'cf-sync-' + Date.now(),
          timeframe: { from: from, to: now },
          parameters: {
            datasets: ['cloudflare-workers'],
            filters: [
              { key: '$metadata.service', operation: 'eq', type: 'string', value: workerName },
              { key: 'level', operation: 'eq', type: 'string', value: 'error' },
            ],
            calculations: [],
            groupBys: [],
            havings: [],
          },
          view: 'events',
          limit: MAX_EVENTS,
        }),
      },
    );

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('[cf-sync] CF API error:', resp.status, txt.slice(0, 500));
      return NextResponse.json(
        { error: 'CF API failed', status: resp.status, detail: txt.slice(0, 200) },
        { status: 502 },
      );
    }

    const data: any = await resp.json();
    const events: CfObservabilityEvent[] =
      data?.result?.events?.events || data?.events || [];

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const ev of events) {
      try {
        const src = ev.source || {};
        const meta = ev['$metadata'] || {};
        const level = meta.level || 'error';

        // Extract message: prefer source.message, fallback to source.error.message
        let message = src.message;
        if (!message && src.error) {
          message = src.error.message + (src.error.stack ? '\n' + src.error.stack : '');
        }
        if (!message) continue;
        message = String(message).slice(0, 4000);

        // Parse timestamp
        const ts = ev.timestamp ? Date.parse(ev.timestamp) : now;
        const createdAt = Number.isFinite(ts) ? ts : now;

        // Generate stable externalId for dedup
        const requestId = src.requestId || src.ipAddress || '';
        const externalId = await hashString(createdAt + '|' + requestId + '|' + message.slice(0, 200));

        // Insert (UNIQUE INDEX on externalId prevents duplicates)
        const r = await d1Run(
          `INSERT OR IGNORE INTO CloudflareLog (
            id, requestId, requestPath, requestMethod, responseStatusCode,
            userAgent, ipAddress, country, region, city, durationMs,
            level, message, externalId, source, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          genId(),
          src.requestId || null,
          src.requestPath || null,
          src.requestMethod || null,
          src.responseStatusCode || null,
          src.userAgent || null,
          src.ipAddress || null,
          src.country || null,
          src.region || null,
          src.city || null,
          src.durationMs || null,
          level,
          message,
          externalId,
          'cloudflare',
          createdAt,
        );

        if (r.success && r.meta?.changes > 0) inserted++;
        else skipped++;
      } catch (e: any) {
        errors++;
        console.error('[cf-sync] event insert error:', e?.message?.slice(0, 200));
      }
    }

    // Cleanup: keep only last 30 days to avoid table bloat
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const cleanup = await d1Run(
      `DELETE FROM CloudflareLog WHERE createdAt < ? AND source = 'cloudflare'`,
      cutoff,
    );

    return NextResponse.json({
      ok: true,
      window: { from: new Date(from).toISOString(), to: new Date(now).toISOString() },
      fetched: events.length,
      inserted,
      skipped, // duplicates (already synced)
      errors,
      cleaned: cleanup?.meta?.changes || 0,
    });
  } catch (e: any) {
    console.error('[cf-sync] FATAL:', e?.message);
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}

/** SHA-256 hex of a string (using Web Crypto, available in Workers). */
async function hashString(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

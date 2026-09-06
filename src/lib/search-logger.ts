// @ts-nocheck
/**
 * Search request logger — logs every request to /api/search/*
 * with IP, UA, query, response status, duration.
 * 
 * Used to:
 * 1. Identify bot patterns (which UAs hit which endpoints)
 * 2. Track rate-limited requests (429s)
 * 3. Tune rate limit thresholds
 *
 * 2026-09-07: Created in response to 7,448 bot visitors on /recherche in 7 days.
 */

import { getClientIp } from './security';

interface LogSearchRequestOpts {
  endpoint: string;
  request: Request;
  query?: string;
  status: number;
  durationMs: number;
  userId?: string | null;
}

let idCounter = 0;
function genId(): string {
  idCounter++;
  return `srlog${Date.now()}${idCounter}${Math.random().toString(36).slice(2, 6)}`;
}

export async function logSearchRequest(opts: LogSearchRequestOpts): Promise<void> {
  try {
    const ip = getClientIp(opts.request);
    const ua = opts.request.headers.get('user-agent') || 'unknown';

    // Try D1 first
    let db: any = null;
    try {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare');
      const ctx = await getCloudflareContext({ async: true });
      db = (ctx as any).env?.DB;
    } catch (e) {
      // Not on CF
    }

    if (db) {
      // CF D1 path
      try {
        await db
          .prepare(
            `INSERT INTO SearchRequestLog
             (id, ipAddress, userAgent, endpoint, query, responseStatus, durationMs, userId, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            genId(),
            ip,
            ua.slice(0, 500), // truncate to 500 chars
            opts.endpoint,
            (opts.query || '').slice(0, 200),
            opts.status,
            opts.durationMs,
            opts.userId || null,
            Date.now(),
          )
          .run();
        return;
      } catch (e: any) {
        // Fall through to console log
        console.error('[search-log] D1 write failed:', e?.message);
      }
    }

    // Console fallback (Vercel log drain will pick it up)
    console.log(
      `[search-log] ${opts.endpoint} ip=${ip} status=${opts.status} duration=${opts.durationMs}ms ua="${ua.slice(0, 80)}" q="${(opts.query || '').slice(0, 50)}"`
    );
  } catch (e: any) {
    // never throw
    console.error('[search-log] error:', e?.message);
  }
}

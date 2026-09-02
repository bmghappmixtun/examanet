// @ts-nocheck
/**
 * Lightweight metrics collection using Cloudflare Workers KV.
 * PERF 2026-09-02: Used by /api/cron/monitor-alerts to detect performance regressions.
 *
 * Records (path, durationMs, statusCode) for each request.
 * Auto-cleaned after 30 minutes (TTL on KV keys).
 */

const METRICS_TTL = 30 * 60; // 30 min in seconds

export interface MetricEntry {
  path: string;
  durationMs: number;
  statusCode: number;
  ts: number;
}

/**
 * Record a single request metric.
 * Fire-and-forget: caller should NOT await this in hot paths.
 */
export async function recordMetric(
  request: Request,
  response: Response,
  startTime: number,
): Promise<void> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const kv = (ctx as any).env.APP_CACHE;
    if (!kv) return;
    
    const url = new URL(request.url);
    const path = url.pathname;
    const statusCode = response.status;
    const durationMs = Date.now() - startTime;
    const ts = Date.now();
    
    // Key format: metric:{ts}:{path_hash}:{uuid}
    // We use a small path hash to keep keys short but unique
    const pathHash = simpleHash(path).toString(16);
    const uuid = crypto.randomUUID().split('-')[0]; // short uuid
    const key = `metric:${ts}:${pathHash}:${uuid}`;
    
    const entry: MetricEntry = { path, durationMs, statusCode, ts };
    
    // Use waitUntil to not block the response
    (ctx as any).waitUntil(
      kv.put(key, JSON.stringify(entry), { expirationTtl: METRICS_TTL })
    );
  } catch (e) {
    // Silent fail - metrics should never break the response
  }
}

/**
 * Simple FNV-1a hash for paths (short, fast, deterministic).
 */
function simpleHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

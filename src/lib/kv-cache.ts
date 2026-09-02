// @ts-nocheck
/**
 * Generic D1 query cache using Cloudflare Workers KV.
 *
 * PERF 2026-09-02: Reduces D1 rows_read by serving hot data from KV.
 * - KV reads are NOT counted against D1 limits
 * - KV reads are 4-5x cheaper than D1 reads
 * - Each cache entry has a TTL (default 60s)
 *
 * Usage:
 *   const data = await cachedD1Query({
 *     key: 'home-stats-v1',
 *     ttl: 3600, // 1 hour
 *     query: () => db.batch([...statements]),
 *   });
 *
 * Pattern: cache-by-key. Invalidation requires either:
 * - TTL expiration (default)
 * - Manual delete via invalidateCache(key) on writes
 *
 * NOTE: Cache values are stored as JSON in KV. KV has a 25MB value limit,
 * 100k keys limit per namespace, 1MB max value size. For our use case
 * (cached query results), values are typically <100KB.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';

const KV_BINDING = 'APP_CACHE';

export async function getKV() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env[KV_BINDING];
}

interface CachedQueryOptions<T> {
  /** Unique key identifying this cached query (e.g. 'home-stats-v1') */
  key: string;
  /** Time-to-live in seconds. Default: 60 */
  ttl?: number;
  /** The actual D1 query to run on cache miss */
  query: () => Promise<T>;
  /** Optional: namespace prefix to group keys (default: 'd1') */
  prefix?: string;
}

/**
 * Run a D1 query with KV-backed caching.
 *
 * On cache hit: returns the cached value (no D1 reads).
 * On cache miss: runs the query, stores result in KV with TTL, returns it.
 * On KV error: falls back to running the query (graceful degradation).
 */
export async function cachedD1Query<T = any>({
  key,
  ttl = 60,
  query,
  prefix = 'd1',
}: CachedQueryOptions<T>): Promise<T> {
  const fullKey = `${prefix}:${key}`;
  const kv = await getKV();

  // Try cache first
  if (kv) {
    try {
      const cached = await kv.get(fullKey, { type: 'json' });
      if (cached !== null && cached !== undefined) {
        return cached as T;
      }
    } catch (e) {
      // KV read failed — fall through to query
      console.warn(`[kv-cache] read failed for ${fullKey}:`, (e as Error).message);
    }
  }

  // Cache miss — run the query
  const result = await query();

  // Store in KV (best-effort)
  if (kv) {
    try {
      // KV requires expirationTtl to be >= 60s
      const safeTtl = Math.max(60, ttl);
      await kv.put(fullKey, JSON.stringify(result), {
        expirationTtl: safeTtl,
      });
    } catch (e) {
      console.warn(`[kv-cache] write failed for ${fullKey}:`, (e as Error).message);
    }
  }

  return result;
}

/**
 * Invalidate a cache key (e.g. after a write that should bust the cache).
 *
 * Usage:
 *   await invalidateCache('home-stats-v1');
 *   // or
 *   await invalidateCache(['home-stats-v1', 'resources-list-v1']);
 */
export async function invalidateCache(
  key: string | string[],
  prefix: string = 'd1',
): Promise<void> {
  const keys = Array.isArray(key) ? key : [key];
  const kv = await getKV();
  if (!kv) return;

  await Promise.all(
    keys.map(async (k) => {
      try {
        await kv.delete(`${prefix}:${k}`);
      } catch (e) {
        console.warn(`[kv-cache] delete failed for ${prefix}:${k}:`, (e as Error).message);
      }
    }),
  );
}

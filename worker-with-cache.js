/**
 * Custom Worker with edge cache + metrics collection (v17).
 * 
 * - Caches HTML pages at CF edge (caches.default)
 * - Records request metrics (path, durationMs, statusCode) to KV
 * - Used by /api/cron/monitor-alerts for performance monitoring
 */

const CACHEABLE_PATTERNS = [
  /^\/(fr|ar)(\?.*)?$/,
  /^\/(fr|ar)\/ressources(\?.*)?$/,
  /^\/(fr|ar)\/niveaux(\?.*)?$/,
  /^\/(fr|ar)\/matieres(\?.*)?$/,
  /^\/(fr|ar)\/professeurs(\?.*)?$/,
  /^\/(fr|ar)\/bac\/archives(\?.*)?$/,
];

// Endpoints to track metrics for (others are ignored to save KV writes)
const METRICS_PATTERNS = [
  /^\/api\/health/,
  /^\/api\/ressources-data/,
  /^\/api\/professeurs\/data/,
  /^\/api\/ressources\/\d+\/detail/,
  /^\/api\/matieres\/list/,
  /^\/(fr|ar)\/?$/,
  /^\/(fr|ar)\/ressources/,
  /^\/(fr|ar)\/niveaux/,
  /^\/(fr|ar)\/professeurs/,
  /^\/(fr|ar)\/matieres/,
  /^\/admin\/?$/,
  /^\/admin\/utilisateurs/,
  /^\/admin\/catalog/,
];

function isCacheable(url) {
  return CACHEABLE_PATTERNS.some((p) => p.test(url.pathname + url.search));
}

function shouldRecordMetric(pathname) {
  return METRICS_PATTERNS.some((p) => p.test(pathname));
}

// Simple FNV-1a hash
function simpleHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Record metric to KV (fire-and-forget)
function recordMetric(env, ctx, path, statusCode, durationMs) {
  if (!env.APP_CACHE) return;
  try {
    const ts = Date.now();
    const pathHash = simpleHash(path).toString(16);
    const uuid = crypto.randomUUID().split('-')[0];
    const key = `metric:${ts}:${pathHash}:${uuid}`;
    const entry = { path, durationMs, statusCode, ts };
    ctx.waitUntil(
      env.APP_CACHE.put(key, JSON.stringify(entry), { expirationTtl: 30 * 60 })
    );
  } catch (e) {
    // Silent fail
  }
}

import openNextWorker from './.open-next/worker.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    const accept = (request.headers.get('accept') || '').toLowerCase();
    const isPrefetch = request.headers.get('next-router-prefetch') === '1';
    const isHtml = accept.includes('text/html') || accept === '' || accept === '*/*' || accept.includes('application/xhtml');
    const cacheable = method === 'GET' && isCacheable(url) && isHtml && !isPrefetch;
    const recordMetricEnabled = method === 'GET' && shouldRecordMetric(url.pathname);
    
    const startTime = Date.now();
    
    if (cacheable) {
      const cache = caches.default;
      // 2026-09-10: Cache key now INCLUDES query string so filtered pages
      // (e.g. ?subject=mathematiques) get separate cache entries from the
      // unfiltered page. Previously the cache key stripped the query string,
      // causing all filtered pages to return the same HTML as the unfiltered one.
      // 2026-09-10 17:30: Include v17 prefix in cache key to INVALIDATE old
      // 500 responses cached during the 14:34-14:51 deploy window.
      const cacheKey = new Request('https://cache.v18/' + url.pathname + url.search, { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('cf-cache-status', 'HIT');
        headers.set('x-cache-wrapper', 'v18-HIT');
        // Record metric for cache hit
        if (recordMetricEnabled) {
          recordMetric(env, ctx, url.pathname, cached.status, Date.now() - startTime);
        }
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers: headers
        });
      }
    }

    const response = await openNextWorker.fetch(request, env, ctx);

    if (cacheable && response.ok && !response.headers.has('set-cookie')) {
      const cache = caches.default;
      // 2026-09-10 17:30: Same v17-prefixed key (see above for invalidation).
      const cacheKey = new Request('https://cache.v18/' + url.pathname + url.search, { method: 'GET' });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    
    // Record metric for non-cached responses
    if (recordMetricEnabled) {
      recordMetric(env, ctx, url.pathname, response.status, Date.now() - startTime);
    }
    
    const headers = new Headers(response.headers);
    headers.set('x-cache-wrapper', 'v18-bypass');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  },
  
  // CF Cron trigger
  // - Every 5 min: monitor-alerts + cf-observability-sync
  // - Daily 3 AM UTC: cleanup-views + nightly-cleanup
  async scheduled(event, env, ctx) {
    const secret = env.CRON_SECRET || 'monitor-secret';
    const base = 'https://examanet-prod.examanet-poc.workers.dev';
    // CF Cron passes a `cron` field on the event for the expression that fired.
    // 2026-09-05: dispatch based on cron expression.
    const cron = event?.cron || '*/5 * * * *';

    if (cron === '0 3 * * *') {
      // Nightly cleanup at 3 AM UTC
      for (const path of ['/api/cron/cleanup-views', '/api/cron/nightly-cleanup']) {
        try {
          const url = `${base}${path}?secret=${encodeURIComponent(secret)}`;
          const res = await fetch(url, { method: 'GET' });
          console.log(`[scheduled ${cron}] ${path}:`, res.status, (await res.text()).slice(0, 500));
        } catch (e) {
          console.error(`[scheduled ${cron}] ${path} failed:`, e.message);
        }
      }
      return;
    }

    // Default: */5 * * * * (every 5 min)
    // 1. monitor-alerts (perf monitoring)
    try {
      const url = `${base}/api/cron/monitor-alerts?secret=${encodeURIComponent(secret)}`;
      const res = await fetch(url, { method: 'GET' });
      console.log('[scheduled] monitor-alerts:', res.status, (await res.text()).slice(0, 500));
    } catch (e) {
      console.error('[scheduled] monitor-alerts failed:', e.message);
    }

    // 2. cf-observability-sync (pull CF Worker logs → D1 VercelLog)
    try {
      const url = `${base}/api/cron/cf-observability-sync?secret=${encodeURIComponent(secret)}`;
      const res = await fetch(url, { method: 'GET' });
      console.log('[scheduled] cf-observability-sync:', res.status, (await res.text()).slice(0, 500));
    } catch (e) {
      console.error('[scheduled] cf-observability-sync failed:', e.message);
    }

    // 3. agent-poll (was on Vercel cron 0 */6 * * *) — fire every 5 min, the
    // route itself dedupes since it tracks lastRunAt.
    try {
      const url = `${base}/api/cron/agent-poll?secret=${encodeURIComponent(secret)}`;
      const res = await fetch(url, { method: 'GET' });
      console.log('[scheduled] agent-poll:', res.status, (await res.text()).slice(0, 500));
    } catch (e) {
      console.error('[scheduled] agent-poll failed:', e.message);
    }
  },
};

/**
 * Custom Worker with edge cache + metrics collection (v15).
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
      const urlNoQuery = new URL(url);
      urlNoQuery.search = '';
      const cacheKey = new Request(urlNoQuery.toString(), { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('cf-cache-status', 'HIT');
        headers.set('x-cache-wrapper', 'v15-HIT');
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
      const urlNoQuery = new URL(url);
      urlNoQuery.search = '';
      const cacheKey = new Request(urlNoQuery.toString(), { method: 'GET' });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    
    // Record metric for non-cached responses
    if (recordMetricEnabled) {
      recordMetric(env, ctx, url.pathname, response.status, Date.now() - startTime);
    }
    
    const headers = new Headers(response.headers);
    headers.set('x-cache-wrapper', cacheable ? 'v15-MISS' : 'v15-bypass');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  },
  
  // CF Cron trigger - run every 5 minutes
  async scheduled(event, env, ctx) {
    // Call the monitor-alerts endpoint internally
    try {
      const url = `https://examanet-prod.examanet-poc.workers.dev/api/cron/monitor-alerts?secret=${encodeURIComponent(env.CRON_SECRET || 'monitor-secret')}`;
      const res = await fetch(url, { method: 'GET' });
      console.log('[scheduled] monitor-alerts:', res.status, await res.text());
    } catch (e) {
      console.error('[scheduled] monitor-alerts failed:', e.message);
    }
  },
};

/**
 * Custom Worker with edge cache.
 * 
 * Wraps the opennext worker and adds CF Cache API for public pages.
 * The opennext worker is at .open-next/worker.js
 */

// Cached public URL patterns (must match next.config.js headers)
const CACHEABLE_PATTERNS = [
  /^\/(fr|ar)$/,
  /^\/(fr|ar)\/ressources$/,
  /^\/(fr|ar)\/niveaux$/,
  /^\/(fr|ar)\/matieres$/,
  /^\/(fr|ar)\/professeurs$/,
  /^\/(fr|ar)\/bac\/archives$/,
];

function isCacheable(url) {
  return CACHEABLE_PATTERNS.some((p) => p.test(url.pathname));
}

// Import the opennext worker
import openNextWorker from './.open-next/worker.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Only cache GET requests for cacheable paths
    if (request.method !== 'GET' || !isCacheable(url)) {
      return openNextWorker.fetch(request, env, ctx);
    }
    
    // Use CF Cache API
    const cache = caches.default;
    const cacheKey = new Request(url, { method: 'GET' });
    
    // Check cache (only for browsers - pass through for Next.js prefetch)
    const accept = request.headers.get('accept') || '';
    const isPrefetch = request.headers.get('next-router-prefetch') === '1';
    
    if (!isPrefetch && accept.includes('text/html')) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const response = new Response(cached.body, cached);
        response.headers.set('cf-cache-status', 'HIT');
        response.headers.set('x-cache-source', 'cloudflare-cache-api');
        return response;
      }
    }
    
    // Cache miss - run the opennext worker
    const response = await openNextWorker.fetch(request, env, ctx);
    
    // Only cache successful responses without Set-Cookie
    if (response.ok && !response.headers.has('set-cookie') && !isPrefetch) {
      const responseToCache = response.clone();
      // Add HIT status to original response
      const newResponse = new Response(responseToCache.body, response);
      newResponse.headers.set('cf-cache-status', 'MISS');
      ctx.waitUntil(cache.put(cacheKey, responseToCache));
      return newResponse;
    }
    
    return response;
  },
};

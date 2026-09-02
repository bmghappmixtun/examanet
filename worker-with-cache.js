/**
 * Custom Worker with edge cache (v14 - production).
 * 
 * Properly checks cache for HTML requests and stores successful responses.
 */

const CACHEABLE_PATTERNS = [
  /^\/(fr|ar)(\?.*)?$/,
  /^\/(fr|ar)\/ressources(\?.*)?$/,
  /^\/(fr|ar)\/niveaux(\?.*)?$/,
  /^\/(fr|ar)\/matieres(\?.*)?$/,
  /^\/(fr|ar)\/professeurs(\?.*)?$/,
  /^\/(fr|ar)\/bac\/archives(\?.*)?$/,
];

function isCacheable(url) {
  return CACHEABLE_PATTERNS.some((p) => p.test(url.pathname + url.search));
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
    
    if (cacheable) {
      const cache = caches.default;
      const urlNoQuery = new URL(url);
      urlNoQuery.search = '';
      const cacheKey = new Request(urlNoQuery.toString(), { method: 'GET' });
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set('cf-cache-status', 'HIT');
        headers.set('x-cache-wrapper', 'v14-HIT');
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
    
    const headers = new Headers(response.headers);
    headers.set('x-cache-wrapper', cacheable ? 'v14-MISS' : 'v14-bypass');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  },
};

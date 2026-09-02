/**
 * Examanet Service Worker
 * Custom SW — no deps, lightweight, full control
 *
 * Strategies:
 *   - Static assets (_next/static, images, fonts): cache-first
 *   - Pages: network-first, fallback to cache, fallback to /offline
 *   - API: network-first with 3s timeout, fallback to cache
 *
 * Version: bumped each release to bust old caches.
 */

// Bump this version to force all clients to drop their old caches
// and re-fetch the new bundles. Each deploy that touches a JS chunk
// MUST bump this or users on the old bundle won't see the fix.
const SW_VERSION = 'v1.0.13';
const STATIC_CACHE = `examanet-static-${SW_VERSION}`;
const PAGES_CACHE = `examanet-pages-${SW_VERSION}`;
const API_CACHE = `examanet-api-${SW_VERSION}`;
const IMAGES_CACHE = `examanet-images-${SW_VERSION}`;
const FONTS_CACHE = `examanet-fonts-${SW_VERSION}`;

// Assets to precache on install (shell of the app)
const PRECACHE_URLS = [
  '/',
  '/fr',
  '/ar',
  '/offline',
  '/fr/offline',
  '/ar/offline',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
];

// Routes that should never be cached (auth, mutations, real-time)
const NEVER_CACHE_PATTERNS = [
  /\/api\/auth/,
  /\/api\/stripe/,
  /\/api\/upload/,
  /\/admin/,
  /\/enseignant/,
  /\/api\/cron/,
];

// API GET routes that are safe to cache (read-only public data)
const CACHEABLE_API_PATTERNS = [
  /\/api\/ressources(\?.*)?$/,
  /\/api\/subjects/,
  /\/api\/classes/,
  /\/api\/sections/,
  /\/api\/levels/,
  /\/api\/teachers/,
];

// === LIFECYCLE ===

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Add precache URLs one by one so one failure doesn't break the whole install
      await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      );
      // Skip waiting to activate immediately on first install
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      const validCaches = [STATIC_CACHE, PAGES_CACHE, API_CACHE, IMAGES_CACHE, FONTS_CACHE];
      await Promise.all(
        cacheNames
          .filter((name) => !validCaches.includes(name))
          .map((name) => caches.delete(name))
      );
      // Take control of all open clients
      await self.clients.claim();
    })()
  );
});

// === FETCH HANDLER ===

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Only handle same-origin requests (skip cross-origin like Google Fonts CDN, but we self-host now)
  if (url.origin !== self.location.origin) return;

  // Skip non-cacheable routes
  if (NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    return;
  }

  // === ROUTE STRATEGIES ===

  // 1. Next.js static assets → cache-first (they're immutable with hash in name)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 2. Fonts (woff2) → cache-first
  if (url.pathname.endsWith('.woff2') || url.pathname.endsWith('.woff')) {
    event.respondWith(cacheFirst(request, FONTS_CACHE));
    return;
  }

  // 3. Images → stale-while-revalidate
  if (/\.(png|jpg|jpeg|webp|avif|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, IMAGES_CACHE));
    return;
  }

  // 4. Cacheable API GETs → network-first with 3s timeout
  if (
    url.pathname.startsWith('/api/') &&
    CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(url.pathname))
  ) {
    event.respondWith(networkFirstWithTimeout(request, API_CACHE, 3000));
    return;
  }

  // 5. Pages → network-first, fallback to cache, fallback to /offline
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithOffline(request, PAGES_CACHE));
    return;
  }

  // 6. Everything else → try network, no cache
  // (no event.respondWith = default browser handling)
});

// === STRATEGIES ===

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // No cache and no network — return a synthetic 404
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirstWithTimeout(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Network timeout')), timeoutMs)
      ),
    ]);
    if (response.ok) {
      // Only cache successful responses
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Timeout for page navigation fetches (10s). Vercel cold starts + Neon
// queries can be slow; we don't want to show /offline for that.
// If fetch takes >10s, fall back to cache or a slow-loading page.
const NAV_TIMEOUT_MS = 10000;

function fetchWithTimeout(request, timeoutMs) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('nav-timeout')), timeoutMs)
    ),
  ]);
}

async function networkFirstWithOffline(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
    if (response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Timeout or network error — try cache, then offline
    const cached = await cache.match(request);
    if (cached) return cached;
    // Try the offline page as last resort
    const offlinePage = await cache.match('/offline');
    if (offlinePage) return offlinePage;
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// === MESSAGES (for client ↔ SW communication) ===

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      })()
    );
  }
});

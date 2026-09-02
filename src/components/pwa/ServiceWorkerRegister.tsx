'use client';

import { useEffect } from 'react';

/**
 * Service Worker registration
 * Only registers in production. In dev, HMR + SW can conflict.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // In dev, optionally unregister any existing SW
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        });
      }
      return;
    }

    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none', // Always check for updates
        });

        // Force an immediate update check on every page load. By default
        // the browser only re-checks the SW script every 24h, which means
        // a critical JS fix (like a double-toggle bug) wouldn't land
        // for up to a day. We call .update() to force the check now.
        // 2026-08-09: this was added after a user reported the filter
        // UI was stuck on the old buggy chunks for hours despite the
        // server having deployed the fix.
        reg.update().catch((err) => {
          console.warn('[SW] update() check failed:', err);
        });

        // Listen for waiting worker (new version installed)
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version ready — auto-activate after 5s
              console.info('[SW] New version installed. Refresh to update.');
              setTimeout(() => {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }, 5000);
            }
          });
        });

        // If there's already a waiting worker on page load (browser
        // detected a new version in a background tab and downloaded it),
        // activate it NOW and reload — no 5s wait. The previous code
        // relied on `updatefound` which only fires during the current
        // registration session; if the new SW was downloaded in a prior
        // tab, it would just sit there waiting.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Reload page when new SW takes over
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      } catch (err) {
        console.error('[SW] Registration failed:', err);
      }
    };

    // Register after page load to not block initial render
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}

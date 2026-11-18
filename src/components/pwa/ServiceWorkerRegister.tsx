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
        //
        // 2026-11-18 — CORRECTIF DU BOUCLE DE RECHARGEMENT.
        //
        // Le code d'origine rechargait la page sur CHAQUE `controllerchange`,
        // y compris le tout premier : à l'installation initiale, le SW
        // appelle `clients.claim()` (public/sw.js), ce qui prend le contrôle
        // de la page ouverte et déclenche `controllerchange` → reload.
        //
        // Conséquence mesurée sur la prod (examanet.com/fr) :
        //   - 1re visite d'un profil neuf  => 2 requêtes document + 93 requêtes
        //     totales (et non 1 + 47)
        //   - le reload rejoue tout : RSC prefetch, /api/status/uptime, chunks…
        //   - à chaque nouveau déploiement, `reg.update()` réinstalle le SW
        //     (updateViaCache: 'none') → le cycle recommence pour tous les
        //     visiteurs qui ont un profil neuf.
        //
        // Sur un trafic composé de bots (qui n'ont pas de cookie persistant),
        // chaque requête est une "première visite" ⇒ chaque requête coûte
        // 2× le document + 10 URLs de precache. C'est un multiplicateur
        // autoinfligeant du trafic, mesuré à 10,8 % des requêtes du 17/11
        // sur les seuls chemins du SW (/fr/offline, /ar/offline, /offline,
        // /sw.js, /manifest.json, /icon-*.png, /favicon.ico).
        //
        // Correctif : on ne recharge QUE si un contrôleur existait déjà
        // avant l'enregistrement, c'est-à-dire s'il s'agit réellement d'une
        // MISE À JOUR d'un SW déjà actif — pas d'une première installation.
        const hadControllerBefore = !!navigator.serviceWorker.controller;
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // Première installation : le SW vient de s'activer, rien à
          // recharger. La page est déjà rendue et fonctionnelle.
          if (!hadControllerBefore) return;
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

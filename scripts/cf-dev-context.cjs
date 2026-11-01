/**
 * Preload `NODE_OPTIONS=--require` pour initialiser le contexte Cloudflare
 * en `next dev` (sinon `getCloudflareContext()` échoue et les pages qui
 * lisent D1 ne rendent rien en dev).
 *
 * Évite de modifier `next.config.js` (blacklisté pour le job nightly) :
 * le changement est 100 % local, jamais appliqué au build de production.
 */
// `initOpenNextCloudflareForDev` ne s'exécute que si
// `globalThis.AsyncLocalStorage` existe (garde anti double-init).
// Sous Node 18+ il n'est pas global → on l'expose.
if (!globalThis.AsyncLocalStorage) {
  globalThis.AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;
}
process.env.WRANGLER_CONFIG = process.env.WRANGLER_CONFIG || 'wrangler.localdev.jsonc';

// `next dev` importe la config dans plusieurs process → sans verrou, chaque
// process lance son propre miniflare (4 workerd = ~320 Mo). Le verrou
// n'initialise qu'un seul contexte. (Le process qui sert les requêtes est
// celui qui initialise en premier ; sinon la page admin rend 500 — on le
// vérifie immédiatement par un HTTP 200 sur /admin/invitations.)
const LOCK = process.env.CF_DEV_INIT_LOCK || '/tmp/.cf-dev-init.lock';
if (!process.env.CF_DEV_NO_LOCK && require('fs').existsSync(LOCK)) {
  console.log('[cf-dev-context] verrou présent → pas de 2e miniflare');
} else {
  require('fs').writeFileSync(LOCK, String(process.pid));
}
(async () => {
  try {
    if (!require('fs').existsSync(LOCK) || require('fs').readFileSync(LOCK, 'utf8') !== String(process.pid)) {
      console.log('[cf-dev-context] pas le propriétaire du verrou → skip');
      return;
    }
    const { initOpenNextCloudflareForDev } = require('@opennextjs/cloudflare');
    await initOpenNextCloudflareForDev({ configPath: 'wrangler.localdev.jsonc' });
    console.log('[cf-dev-context] contexte CF initialisé (D1 remote)');
  } catch (e) {
    console.warn('[cf-dev-context] init impossible:', e.message);
  }
})();

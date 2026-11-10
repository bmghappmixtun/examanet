/**
 * Point d'entrée Cloudflare Workers pour la PRODUCTION (examanet-prod).
 *
 * POURQUOI CE FICHIER EXISTE
 * --------------------------
 * Le workflow GitHub Actions déploie la prod avec :
 *     sed 's|"main": "worker-with-cache.js"|"main": ".open-next/worker.js"|' \
 *         wrangler.prod.jsonc > wrangler.github.jsonc
 * (sed introduit lors de la restauration du fichier après un filter-branch,
 *  intention d'origine perdue).
 *
 * Conséquence : le worker déployé en prod est le worker OpenNext BRUT, qui
 * n'exporte AUCUN handler `scheduled` (0 occurrence de "scheduled" dans
 * .open-next/worker.js). Or les triggers cron SONT bien enregistrés sur le
 * script Cloudflare ("0 3 * * *" et la triggerminitiale toutes les 5 min,
 * modifiés le 2026-10-12) : Cloudflare les déclenchait donc toutes les 5
 * minutes… vers un worker sans handler => les jobs /api/cron/* n'ont jamais
 * tourné en prod.
 *
 * Ce wrapper relaie `fetch` tel quel (SANS la couche de cache HTML de
 * worker-with-cache.js : celle-ci posait des entrées caches.default SANS
 * TTL, donc un HTML figé jusqu'au bump manuel de la clé "cache.v22") et
 * restore le handler `scheduled` + l'écriture des métriques KV dont vit
 * /api/cron/monitor-alerts.
 *
 * Le worker DEV (wrangler.dev.jsonc) continue d'utiliser worker-with-cache.js
 * (cache HTML + métriques + crons).
 */

// Endpoints to track metrics for (others are ignored to save KV writes)
// → identique à worker-with-cache.js : /api/cron/monitor-alerts lit ces clés.
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

/** Record metric to KV (fire-and-forget). */
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
import { runCronJobs } from './cron-jobs.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const startTime = Date.now();

    // Pas de cache HTML ici : la prod se fie au cache edge standard
    // (Cache-Control: s-maxage=120 posé par next.config.js).
    const response = await openNextWorker.fetch(request, env, ctx);

    if (request.method === 'GET' && shouldRecordMetric(url.pathname)) {
      recordMetric(env, ctx, url.pathname, response.status, Date.now() - startTime);
    }

    return response;
  },

  /**
   * Handler `scheduled` : c'est lui qui manquait en prod.
   * Cloudflare appelle ce handler à chaque déclenchement cron du script.
   */
  async scheduled(event, env, ctx) {
    await runCronJobs(event, env, ctx);
  },
};

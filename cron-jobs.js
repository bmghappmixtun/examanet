/**
 * Dispatch des crons Cloudflare Workers — partagé par worker-cron.js (prod)
 * et worker-with-cache.js (dev).
 *
 * 2026-11-10 : `agent-poll` a été RETIRÉ du cron de 5 minutes.
 * Il marque `agentSeen = 1` (exactement le flag du nightly-cleanup) sans
 * aucun dedupe : lancé toutes les 5 min, il consommait les erreurs avant
 * le rapport de 03:00 et le nightly-cleanup ne trouvait plus rien à
 * signaler sur Discord. Le marquage appartient désormais au seul
 * nightly-cleanup (03:00 UTC) ; l'agent lit le digest 7 j + session-start.
 * La route /api/cron/agent-poll reste appelable manuellement.
 */
export const CRON_JOBS = {
  // 03:00 UTC = 04:00 Tunisie : le rapport nocturne + le marquage.
  '0 3 * * *': ['/api/cron/cleanup-views', '/api/cron/nightly-cleanup'],
  // Toutes les 5 minutes : la supervision (aucun marquage d'erreurs).
  '*/5 * * * *': ['/api/cron/monitor-alerts', '/api/cron/cf-observability-sync'],
};

/**
 * Exécute les jobs correspondant à l'expression cron qui a déclenché.
 * Ne fait RIEN si le secret ou l'URL de base manquent (pas de fallback :
 * une valeur par défaut produirait des appels 401 silencieux).
 */
export async function runCronJobs(event, env, ctx) {
  const cron = event?.cron || '*/5 * * * *';

  const secret = env?.CRON_SECRET;
  const base = env?.WORKER_BASE_URL;
  if (!secret || !base) {
    console.error('[scheduled] CRON_SECRET / WORKER_BASE_URL absent → job ignoré');
    return;
  }

  const jobs = CRON_JOBS[cron] || CRON_JOBS['*/5 * * * *'];
  console.log(`[scheduled] cron=${cron} → ${jobs.join(', ')}`);

  for (const path of jobs) {
    try {
      const res = await fetch(`${base}${path}?secret=${encodeURIComponent(secret)}`, {
        method: 'GET',
      });
      const body = await res.text();
      console.log(`[scheduled ${cron}] ${path}: ${res.status} ${body.slice(0, 300)}`);
    } catch (e) {
      console.error(`[scheduled ${cron}] ${path} failed:`, e.message);
    }
  }
}

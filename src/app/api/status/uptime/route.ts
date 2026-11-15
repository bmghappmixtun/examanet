// @ts-nocheck
/**
 * /api/status/uptime — statut de disponibilité d'Examanet, en lecture seule.
 *
 * 2026-11-15 : créé après l'outage du 7.05 (500 sur toutes les pages pendant
 * ~7 h, détecté par l'utilisateur et non par une surveillance automatique).
 * Objectif :
 * donner à l'agent (tâche planifiée) une source unique, très bon marché, pour
 * savoir si le site répond — et le faire vérifier DEPUIS l'extérieur quand
 * une clé UptimeRobot est configurée.
 *
 * Deux sources, combinées :
 *
 *  1. Contrôle direct depuis le worker (vocation interne) :
 *     - HEAD https://examanet.com/fr?ci=<ts>  → rend à FROID la page (le
 *       cache-buster évite de servir le HTML mis en cache par l'edge) et
 *       vérifie ainsi la chaîne DNS → edge → worker → D1 → rendu.
 *     - GET  https://examanet.com/api/health    → vérifie le worker + D1.
 *
 *  2. UptimeRobot (vocation externe, multi-régions) : si le secret
 *     `UPTIMEROBOT_API_KEY` est présent, on interroge l'API v3
 *     (GET https://api.uptimerobot.com/v3/monitors). C'est la seule source qui
 *     voit un incident Cloudflare global, une coupure DNS ou l_workers.dev
 *     hors de nos mains. Limite du free plan : 10 requêtes/min.
 *
 * Cache KV de 60 s (namespace APP_CACHE) : les hits ne relancent aucun fetch
 * et l'API UptimeRobot reste largement sous sa limite.
 *
 * Route PUBLIQUE et SANS EFFET DE BORDRE (aucun email, aucune écriture D1) :
 * elle n'expose que des statuts et des temps de réponse.
 */

import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_KEY = 'uptime:status:v1';
const CACHE_TTL_SECONDS = 60;
const FETCH_TIMEOUT_MS = 15_000;
const UPTIMEROBOT_API = 'https://api.uptimerobot.com/v3/monitors';

/** Cibles contrôlées en interne (vocation interne). */
const INTERNAL_TARGETS = [
  {
    name: 'homepage',
    url: 'https://examanet.com/fr',
    method: 'HEAD',
    cacheBust: true,
  },
  {
    name: 'api-health',
    url: 'https://examanet.com/api/health',
    method: 'GET',
    cacheBust: false,
  },
];

async function checkTarget(target) {
  const started = Date.now();
  const url = target.cacheBust
    ? `${target.url}?ci=${Date.now()}`
    : target.url;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      method: target.method,
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'Examanet-UptimeCheck/1.0' },
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    const ok = res.status >= 200 && res.status < 400;
    return {
      name: target.name,
      url: target.url,
      method: target.method,
      ok,
      status: res.status,
      latencyMs,
      error: ok ? undefined: `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      name: target.name,
      url: target.url,
      method: target.method,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: String(e?.message || e),
    };
  }
}

/**
 * Interroge l'API UptimeRobot v3 (clé en lecture seule).
 * Les moniteurs UptimeRobot : status 1 = paused, 2 = up, 3 = down.
 */
async function checkUptimeRobot(apiKey) {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(UPTIMEROBOT_API, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        configured: true,
        ok: false,
        error: `HTTP ${res.status}`,
        latencyMs: Date.now() - started,
      };
    }
    const data = await res.json();
    const list = Array.isArray(data?.monitors) ? data.monitors : [];
    const monitors = list.map((m) => ({
      id: m.id,
      name: m.friendly_name || m.url,
      url: m.url,
      status: m.status,
      up: m.status === 2,
      paused: m.status === 1,
      responseTimeMs: m.response_times?.[0]?.response_time ?? null,
      lastCheckTs: m.last_check_ts ?? null,
    }));
    return {
      configured: true,
      ok: monitors.every((m) => m.up || m.paused),
      latencyMs: Date.now() - started,
      monitors,
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      error: String(e?.message || e),
      latencyMs: Date.now() - started,
    };
  }
}

export async function GET() {
  const ctx = await getCloudflareContext({ async: true });
  const kv = (ctx as any).env?.APP_CACHE;

  // Cache court : évite de hammering UptimeRobot (10 req/min en free) et
  // le domaine public.
  if (kv) {
    try {
      const cached = await kv.get(CACHE_KEY, { type: 'json' });
      if (cached && cached.checkedAt) {
        return NextResponse.json(
          { ...cached, cached: true },
          { headers: { 'cache-control': 'no-store' } }
        );
      }
    } catch {
      /* cache indisponible : on recalcule */
    }
  }

  const checks = await Promise.all(INTERNAL_TARGETS.map(checkTarget));

  let uptimerobot = { configured: false };
  const apiKey = await getSecret('UPTIMEROBOT_API_KEY');
  if (apiKey) {
    uptimerobot = await checkUptimeRobot(apiKey);
  }

  const internalOk = checks.every((c) => c.ok);
  const externalOk = uptimerobot.configured ? uptimerobot.ok !== false : true;

  const payload = {
    ok: internalOk && externalOk,
    checkedAt: new Date().toISOString(),
    source: uptimerobot.configured ? 'worker+uptimerobot' : 'worker',
    checks,
    uptimerobot,
  };

  if (kv) {
    try {
      await kv.put(CACHE_KEY, JSON.stringify(payload), {
        expirationTtl: CACHE_TTL_SECONDS,
      });
    } catch {
      /* écriture cache best-effort */
    }
  }

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}

// @ts-nocheck
/**
 * /api/status/uptime — statut de disponibilité d'Examanet, en lecture seule.
 *
 * 2026-11-15 : créé après l'outage du 7.05 (500 sur toutes les pages pendant
 * ~7 h, détecté par l'utilisateur et non par une surveillance automatique).
 * Objectif : une source unique, très bon marché, pour savoir si le site
 * répond — et le faire vérifier DEPUIS l'extérieur quand une clé UptimeRobot
 * est configurée.
 *
 * Deux sources, combinées :
 *
 *  1. Contrôle direct depuis le worker (vocation interne) :
 *     - GET {origine}/fr?ci=<ts> → rend à FROID la page (le cache-buster évite
 *       de servir le HTML mis en cache par l'edge) et vérifie ainsi la chaîne
 *       DNS → edge → worker → D1 → rendu. On lit les 16 premiers Ko du HTML
 *       pour détecter une page d'erreur servie en 200 (`__next_error__`) :
 *       c'est le mode de panne le plus vicieux, invisible pour un simple
 *       contrôle de code HTTP.
 *     - GET {origine}/api/health → vérifie le worker + D1.
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

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_KEY_PREFIX = 'uptime:status:v1';
const CACHE_TTL_SECONDS = 60;
const FETCH_TIMEOUT_MS = 15_000;
const UPTIMEROBOT_API = 'https://api.uptimerobot.com/v3/monitors';
/** Octets de HTML lus pour détecter une page d'erreur servie en 200. */
const BODY_SNIFF_BYTES = 16 * 1024;

/**
 * Origines autorisées à être surveillées (le worker ne va pas chercher
 * n'importe quelle URL passée en Host — garde-fou anti-SSRF).
 */
const ALLOWED_ORIGINS = [
  'https://examanet.com',
  'https://www.examanet.com',
  'https://examanet-prod.examanet-poc.workers.dev',
  'https://examanet-dev.examanet-poc.workers.dev',
  'https://examanet-poc.examanet-poc.workers.dev',
];

const DEFAULT_ORIGIN = 'https://examanet.com';

/**
 * Base des cibles contrôlées = l'origine par laquelle la route est appelée
 * (l'agent interroge le worker de prod, donc c'est la prod qui est contrôlée ;
 * un appel sur le worker de dev contrôle le dev). Si l'origine n'est pas
 * dans la liste blanche → origine par défaut (prod).
 *
 * NOTE : `NEXT_PUBLIC_SITE_URL` est figé au BUILD et n'est pas défini dans
 * l'environnement de build de la CI → inutile ici.
 */
function resolveSiteBase(requestOrigin?: string) {
  if (!requestOrigin) return DEFAULT_ORIGIN;
  const clean = requestOrigin.replace(/\/+$/, '');
  return ALLOWED_ORIGINS.includes(clean) ? clean : DEFAULT_ORIGIN;
}

/** Cibles contrôlées en interne (vocation interne). */
function buildTargets(siteBase: string) {
  return [
    {
      name: 'homepage',
      url: `${siteBase}/fr`,
      method: 'GET',
      // lecture du début du HTML : détecte une page d'erreur servie en 200
      inspectBody: true,
      cacheBust: true,
    },
    {
      name: 'api-health',
      url: `${siteBase}/api/health`,
      method: 'GET',
      inspectBody: false,
      cacheBust: false,
    },
  ];
}

/** Lit les premiers octets d'un stream et le ferme. */
async function sniffBody(res: Response, maxBytes: number): Promise<string> {
  try {
    if (!res.body) return await res.text();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    try {
      await reader.cancel();
    } catch {
      /* best-effort */
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
  } catch {
    return '';
  }
}

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

    let bodyError: string | undefined;
    if (target.inspectBody) {
      const head = await sniffBody(res, BODY_SNIFF_BYTES);
      // Une page d'erreur Next.js commence par <html id="__next_error__">.
      if (head.includes('__next_error__')) {
        bodyError = 'page d\'erreur servie en 200 (__next_error__)';
      } else if (!head.trim()) {
        bodyError = 'corps de réponse vide';
      }
    }

    const statusOk = res.status >= 200 && res.status < 400;
    const ok = statusOk && !bodyError;
    return {
      name: target.name,
      url: target.url,
      method: target.method,
      ok,
      status: res.status,
      latencyMs,
      error: ok
        ? undefined
        : bodyError || `HTTP ${res.status}`,
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
 * Un moniteur UptimeRobot appartient-il à Examanet ?
 * Le compte UptimeRobot contient aussi les AUTRES sites du propriétaire
 * (Devoirat.net, Tunisiecollege.net, Zitounawood…) : seul un moniteur
 * Examanet doit pouvoir faire basculer le verdict de cette route.
 */
function isExamanetMonitor(monitor: { url?: string }): boolean {
  return /^https?:\/\/(www\.)?examanet\.com(\/|$)/i.test(
    String(monitor?.url ?? '')
  );
}

/**
 * Interroge l'API UptimeRobot v3 (clé en lecture seule).
 *
 * Distinction importante :
 *  - `apiOk`  = l'appel à l'API a réussi (sinon on ne sait rien) ;
 *  - `monitorsDown` = les moniteurs qui sont explicitement DOWN.
 * Un échec de l'API NE DOIT PAS faire basculer le verdict global : sinon une
 * coupure réseau de l'API UptimeRobot déclencherait un faux incident.
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
        apiOk: false,
        error: `HTTP ${res.status}`,
        latencyMs: Date.now() - started,
        monitorsDown: [],
        monitors: [],
      };
    }
    const data = await res.json();
    // v3 : la réponse est { "data": [ ...moniteurs... ] } (et non { monitors: [] }).
    // On tolère les deux formes.
    const root = data?.data ?? data;
    const list = Array.isArray(root) ? root : (root?.monitors ?? []);
    const monitors = list.map((m) => {
      // v2 : 1 = paused, 2 = up, 3 = down. v3 renvoie une CHAÎNE
      // ("UP"/"DOWN"/"PAUSED") ; on tolère aussi un objet imbriqué.
      const raw = m.status;
      const rawValue =
        raw && typeof raw === 'object'
          ? (raw as any).value ?? (raw as any).status ?? (raw as any).state
          : raw;
      const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      const state =
        typeof rawValue === 'string'
          ? rawValue.toLowerCase()
          : num === 1
            ? 'paused'
            : num === 2
              ? 'up'
              : num === 3
                ? 'down'
                : 'unknown';
      return {
        id: m.id,
        name: m.friendly_name || m.friendlyName || m.url,
        url: m.url,
        status: raw,
        state,
        up: state === 'up',
        paused: state === 'paused',
        down: state === 'down',
        // durée dans l'état courant (secondes) : "UP depuis 11 h"
        upForSeconds:
          typeof m.currentStateDuration === 'number'
            ? m.currentStateDuration
            : null,
        intervalSeconds: m.interval ?? null,
        method: m.httpMethodType ?? 'GET',
        regions: m.regionalData?.REGION ?? null,
        lastIncident: m.lastIncident ?? null,
        responseTimeMs:
          m.response_times?.[0]?.response_time ??
          m.responseTimes?.[0]?.responseTime ??
          null,
      };
    });
    const monitorsDown = monitors.filter((m) => m.down && isExamanetMonitor(m)).map((m) => m.name);
    // Les autres sites du MÊME compte UptimeRobot (Devoirat.net,
    // Tunisiecollege.net, Zitounawood…) ne doivent PAS faire basculer le
    // verdict Examanet : sinon la veille croirait à une panne d'Examanet et
    // partirait corriger le mauvais site. Ils sont remontés à part.
    const otherMonitorsDown = monitors
      .filter((m) => m.down && !isExamanetMonitor(m))
      .map((m) => m.name);
    return {
      configured: true,
      apiOk: true,
      latencyMs: Date.now() - started,
      monitorsDown,
      otherMonitorsDown,
      monitors,
    };
  } catch (e) {
    return {
      configured: true,
      apiOk: false,
      error: String(e?.message || e),
      latencyMs: Date.now() - started,
      monitorsDown: [],
      monitors: [],
    };
  }
}

export async function GET(req: NextRequest) {
  const siteBase = resolveSiteBase(req.nextUrl?.origin || req.url);
  const CACHE_KEY = `${CACHE_KEY_PREFIX}:${siteBase.replace(/[^a-z0-9]+/gi, '_')}`;

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

  const checks = await Promise.all(buildTargets(siteBase).map(checkTarget));

  let uptimerobot = { configured: false };
  const apiKey = await getSecret('UPTIMEROBOT_API_KEY');
  if (apiKey) {
    uptimerobot = await checkUptimeRobot(apiKey);
  }

  const internalOk = checks.every((c) => c.ok);
  // Seuls des moniteurs EXPLICITEMENT down font tomber le verdict : une
  // indisponibilité de l'API UptimeRobot est un avertissement, pas une panne.
  const externalDown =
    uptimerobot.configured && (uptimerobot.monitorsDown?.length ?? 0) > 0;

  const payload = {
    ok: internalOk && !externalDown,
    checkedAt: new Date().toISOString(),
    source: uptimerobot.configured ? 'worker+uptimerobot' : 'worker',
    siteBase,
    checks,
    uptimerobot,
    warnings: [
      ...(uptimerobot.configured && uptimerobot.apiOk === false
        ? [`UptimeRobot API injoignable : ${uptimerobot.error}`]
        : []),
      ...((uptimerobot as any).otherMonitorsDown?.length
        ? [
            `Autres sites du compte UptimeRobot en panne (hors Examanet) : ${(
              (uptimerobot as any).otherMonitorsDown
            ).join(', ')}`,
          ]
        : []),
    ],
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

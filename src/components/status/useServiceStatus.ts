'use client';

/**
 * Client partagé pour la route publique /api/status/uptime.
 *
 * 2026-11-18 — pourquoi ce module existe :
 * le badge du pied de page (ServiceStatusBadge) et le panneau de la page
 * /statut (ServiceStatusPanel) appelaient chacun `/api/status/uptime` en
 * double : React rejoue les `useEffect` en mode strict (reactStrictMode:true)
 * et le composant est remonte apres l'hydratation (le footer est re-rendu a
 * la reception du RSC payload).
 *
 * Mesure sur examanet.com le 18/11 :
 *   - /fr        -> 2 appels /api/status/uptime par affichage
 *   - /fr/statut -> 4 appels par affichage (2 badge + 2 panneau)
 *
 * Sur le 17/11 la route a recu 10 912 requetes, dont 4 990 jugees "bot" par
 * l'assistant Cloudflare AI. En realite c'etaient les robots qui Floodaient
 * les pages ET notre propre badge : chaque affichage de page declenchait 2
 * polls de plus.
 *
 * Correctif : une seule promesse par onglet, partagee entre le badge et le
 * panneau, avec une courte fenetre de cache. Un remontage du composant
 * reutilise la reponse deja en cours ou deja recue au lieu de re-frapper la
 * route.
 */

export type UptimeMonitor = {
  url?: string;
  down?: boolean;
  status?: string;
  type?: string;
};

export type UptimePayload = {
  ok?: boolean;
  checkedAt?: string;
  monitors?: UptimeMonitor[];
  uptimerobot?: { monitors?: UptimeMonitor[] };
};

/** Duree de validite du cache client (la route est deja cachee 60 s cote KV). */
const TTL_MS = 45_000;

type CacheEntry = {
  at: number;
  promise: Promise<UptimePayload>;
};

let entry: CacheEntry | null = null;

function fetchOnce(): Promise<UptimePayload> {
  const res = fetch('/api/status/uptime', { cache: 'no-store' });
  return res.then((r) => r.json() as Promise<UptimePayload>);
}

/**
 * Retourne la charge utile d'uptime. Les appels rapproches partagent la meme
 * requete ; apres TTL, une nouvelle requete est lancee.
 */
export function loadUptime(force = false): Promise<UptimePayload> {
  const now = Date.now();
  if (!force && entry && now - entry.at < TTL_MS) {
    return entry.promise;
  }
  const promise = fetchOnce().catch((err) => {
    // On ne memorise pas l'echec : le prochain appel doit reessayer.
    if (entry?.promise === promise) entry = null;
    throw err;
  });
  entry = { at: now, promise };
  return promise;
}

/** Filtre les moniteurs qui concernent reellement Examanet. */
export function examanetMonitors(payload: UptimePayload | null): UptimeMonitor[] {
  return (payload?.uptimerobot?.monitors ?? []).filter((m) =>
    /^https?:\/\/(www\.)?examanet\.com(\/|$)/i.test(m.url ?? '')
  );
}

/**
 * Constantes de la page d'état du service (status page).
 *
 * - `UPTIMEROBOT_STATUS_URL` : page de statut publique créée sur le compte
 *   UptimeRobot (3 moniteurs Examanet). La page UptimeRobot n'accepte pas
 *   l'iframe (`x-frame-options: DENY`) ⇒ on y renvoie par un lien, pas par
 *   une intégration.
 * - `EXAMANET_MONITOR_LABELS` : libellés lisibles pour les moniteurs, indexés
 *   par URL (le nom technique du moniteur est le même que son URL).
 */
export const UPTIMEROBOT_STATUS_URL = 'https://stats.uptimerobot.com/Fgu4mQDWvU';

export const EXAMANET_MONITOR_LABELS: Record<string, string> = {
  'https://examanet.com/fr': 'monitorFr',
  'https://examanet.com/api/health': 'monitorHealth',
  'https://www.examanet.com': 'monitorWww',
};

/** Un moniteur appartient-il à Examanet ? (le compte UptimeRobot contient aussi d'autres sites) */
export function isExamanetMonitorUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?examanet\.com(\/|$)/i.test(url);
}

/** Formate une date ISO en heure locale lisible (client side uniquement). */
export function formatCheckTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

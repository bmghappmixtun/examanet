/**
 * 2026-11-15 — gestion d'erreurs next-intl avec message exploitable.
 *
 * Par défaut, next-intl journalise l'objet Error : l'observabilité Cloudflare
 * n'en conserve que la stack (« at h2 → f2 → d2 → C2 »), sans la clé
 * fautive. Le digest nocturne remontait donc 6-13 événements/heure sans
 * indication exploitable.
 *
 * Ici on journalie un message lisible : code + clé + namespace.
 * Le rendu reste identique (le repli par défaut reste la clé elle-même).
 */

type IntlErrorLike = {
  code?: string;
  message?: string;
};

export function formatIntlError(error: unknown, key?: string, namespace?: string): string {
  const code = (error as IntlErrorLike)?.code ?? 'UNKNOWN';
  const message = (error as IntlErrorLike)?.message ?? String(error);
  const scope = namespace ? `${namespace}.` : '';
  return `[i18n] ${code} — ${scope}${key ?? '?'} — ${message}`;
}

export function onError(error: unknown): void {
  // en développement on conserve le comportement strict de next-intl
  if (process.env.NODE_ENV !== 'production') throw error;
  console.error(formatIntlError(error));
}

export function getMessageFallback({
  key,
  namespace,
  error,
}: {
  key: string;
  namespace?: string;
  error: unknown;
}): string {
  console.error(formatIntlError(error, key, namespace));
  return key;
}

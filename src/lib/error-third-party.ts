/**
 * Détection des erreurs causées par un TIERS (extension navigateur, script
 * injecté, wallet, translate…) et non par le code de l'application.
 *
 * Pourquoi c'est nécessaire (nightly #27, 2026-11-10) :
 * sur 14 jours, les 2 premiers groupes du digest étaient des erreurs 100 %
 * tierces (extensions Chrome injectées dans le bundle). Le classifieur les
 * proposait comme « auto-fix candidates » alors qu'aucune ligne de `src/`
 * n'est en cause → le nightly partait sur un faux positif.
 *
 * Heuristique (stack brute), volontairement CONSERVATRICE :
 *  - on neDeclare tiers que si la preuve est nette, parce qu'un faux « tiers »
 *    fait ignorer silencieusement un vrai bug (pire qu'un faux positif) ;
 *  - 1) une frame `chrome-extension://`, `moz-extension://`,
 *    `safari-extension://`, `extension://` → tiers, sans ambiguïté ;
 *  - 2) la stack contient des frames (« at … ») et AUCUNE n'est une frame de
 *    l'application (`/_next/…` ou `.next/server/…`) → tiers (notre code n'a
 *    produit aucune frame) ;
 *  - 3) sinon → PAS de conclusion de tiers → l'erreur est conservée.
 *    Cas 3 : stack vide (souvent « Script error. » cross-origin ou une erreur
 *    réseau WebKit) et stack sans frames (erreur RSC serveur synthétisée par
 *    Next.js, ex. « An error occurred in the Server Components render ») —
 *    on ne peut pas trancher, donc on garde.
 */
const APP_FRAME = /\/_next\/|\.next\/server\//;
const FOREIGN_FRAME =
  /(chrome-extension|moz-extension|safari-extension|ms-browser-extension|extension):\/\//;
const HAS_FRAME = /^\s*at\s+\S/m;

/** true si la stack ne contient aucune frame de l'application ET des frames. */
export function isThirdPartyStack(stack: unknown): boolean {
  const s = typeof stack === 'string' ? stack.trim() : '';
  if (!s) return false; // stack vide → pas de conclusion
  if (FOREIGN_FRAME.test(s)) return true;
  if (!HAS_FRAME.test(s)) return false; // aucune frame → pas de conclusion
  return !APP_FRAME.test(s);
}

/** Variante ligne de log : s'appuie sur la stack + l'UA du contexte. */
export function isThirdPartyError(row: { stack?: unknown; context?: unknown }): boolean {
  if (isThirdPartyStack(row?.stack)) return true;
  const ctx = typeof row?.context === 'string' ? row.context : '';
  if (ctx && FOREIGN_FRAME.test(ctx)) return true;
  return false;
}

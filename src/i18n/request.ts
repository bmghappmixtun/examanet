import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import { onError, getMessageFallback } from './error-handlers';
import frMessages from '../messages/fr.json';
import arMessages from '../messages/ar.json';

const messagesMap = { fr: frMessages, ar: arMessages } as const;

/**
 * Server-side request config for next-intl.
 * Loads the right message bundle for the current locale.
 *
 * 2026-11-15 : `onError` / `getMessageFallback` personnalisés → les erreurs
 * de traduction sont journalisées avec la clé fautive (l'observabilité CF ne
 * conservait que la stack). Voir src/i18n/error-handlers.ts.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) 
    ? requested 
    : routing.defaultLocale;

  return {
    locale,
    messages: messagesMap[locale],
    onError,
    getMessageFallback,
  };
});

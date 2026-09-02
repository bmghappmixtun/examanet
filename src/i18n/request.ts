import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import frMessages from '../messages/fr.json';
import arMessages from '../messages/ar.json';

const messagesMap = { fr: frMessages, ar: arMessages } as const;

/**
 * Server-side request config for next-intl.
 * Loads the right message bundle for the current locale.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) 
    ? requested 
    : routing.defaultLocale;

  return {
    locale,
    messages: messagesMap[locale],
  };
});

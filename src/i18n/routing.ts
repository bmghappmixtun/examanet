import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing config for Examanet.
 *
 * - Supported: French (fr, default) and Arabic (ar)
 * - Both languages use URL prefix (/fr/* and /ar/*) for SEO clarity
 * - Cookie NEXT_LOCALE persists user preference (1 year by default)
 * - RTL is auto-handled via dir attribute on <html>
 */
export const routing = defineRouting({
  locales: ['fr', 'ar'] as const,
  defaultLocale: 'fr',
  localePrefix: 'always', // /fr/ressources AND /ar/ressources
  localeCookie: {
    name: 'NEXT_LOCALE',
    // 1 year persistence (matches our existing 'locale' cookie TTL)
  },
});

export type Locale = (typeof routing.locales)[number];

export const RTL_LOCALES: Locale[] = ['ar'];

export function isRTL(locale: string): boolean {
  return RTL_LOCALES.includes(locale as Locale);
}

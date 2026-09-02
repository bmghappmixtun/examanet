/**
 * SEO URL helpers — locale-aware URL builders for canonical, hreflang, breadcrumbs.
 *
 * 2026-08-22: every public URL in the app should be built via these helpers
 * so the canonical and hreflang alternates are always in sync with the
 * current locale. The previous pattern of `${SITE_URL}/path` (no locale
 * prefix) caused every [locale]/* page to have a duplicate-content
 * canonical pointing to the root.
 */

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

/**
 * Build a fully-qualified URL with the correct locale prefix.
 *
 * @param path - URL path (with or without leading slash, e.g. '/bac' or 'matieres/math')
 * @param locale - 'fr' or 'ar'. Default locale 'fr' has no URL prefix in the
 *                 rendered app (the middleware redirects /bac → /fr/bac), so
 *                 for SEO we use the prefixed form explicitly here.
 * @returns e.g. localeUrl('/bac', 'ar') === 'https://examanet.com/ar/bac'
 */
export function localeUrl(path: string, locale: 'fr' | 'ar'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}/${locale}${normalized === '/' ? '' : normalized}`;
}

/**
 * Build the canonical URL for the current page.
 * - For /fr/foo: returns 'https://examanet.com/fr/foo'
 * - For /ar/foo: returns 'https://examanet.com/ar/foo'
 */
export function canonicalUrl(path: string, locale: 'fr' | 'ar'): string {
  return localeUrl(path, locale);
}

/**
 * Build hreflang alternates object for Next.js metadata `alternates.languages`.
 * Returns { 'fr-TN': ..., 'ar-TN': ..., 'x-default': ... } with both locales
 * pointed at each other's URL (for proper bidirectional hreflang).
 */
export function hreflangAlternates(path: string) {
  return {
    'fr-TN': localeUrl(path, 'fr'),
    'ar-TN': localeUrl(path, 'ar'),
    'x-default': localeUrl(path, 'fr'),
  };
}

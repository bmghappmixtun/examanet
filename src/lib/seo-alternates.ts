// SEO 2026-10-25 — shared hreflang / canonical builder.
//
// WHY THIS EXISTS
// ---------------
// Next.js does NOT replace a parent's `alternates` when a child declares its
// own: it renders the ROOT layout's alternates AND the leaf page's alternates
// as two separate sets of <link rel="alternate">. The root layout used to
// emit `languages` pointing at the HOMEPAGE (fr-TN -> https://examanet.com,
// ar-TN -> https://examanet.com/ar, x-default -> https://examanet.com), so
// EVERY localized page shipped hreflang asserting that "the French version
// of this page is the homepage" — observed on /fr/matieres, /fr/niveaux/*,
// /fr/cours/*, /fr/devoirs/*, /fr/ressources… while the canonical was right.
//
// The root layout no longer emits `languages` (see src/app/layout.tsx).
// Consequence: every page that declares its own `alternates` must declare
// its own hreflang, otherwise it falls back to the [locale] layout's
// locale-root hreflang (which is only correct for /fr and /ar themselves).
//
// The FR and AR routes are perfectly mirrored (/fr/X <-> /ar/X, same slug —
// resources/classes/subjects are single rows shared by both locales), so the
// AR variant is always the same path with the locale segment swapped.
//
// Usage:
//   import { localeAlternates } from '@/lib/seo-alternates';
//   ...
//   alternates: localeAlternates('/college'),
//
// For a page whose path is built from route params, pass the param too:
//   alternates: localeAlternates(`/cours/${slug}`),

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

/**
 * Builds a complete `alternates` object (canonical + fr/ar/x-default
 * hreflang) for a locale-agnostic path.
 *
 * @param path Locale-agnostic path, e.g. '/college', '/cours/mon-sujet'.
 *              The leading slash is optional; '/' maps to the locale root.
 */
export function localeAlternates(path: string = '/') {
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  const fr = `${SITE_URL}/fr${clean}`;
  const ar = `${SITE_URL}/ar${clean}`;

  return {
    canonical: fr,
    languages: {
      'fr-TN': fr,
      'ar-TN': ar,
      'x-default': fr,
    },
  };
}

/**
 * Same as {@link localeAlternates} but the CANONICAL follows the current
 * locale (the AR variant of a page must canonicalize to the AR URL, not to
 * the FR one).
 */
export function localeAlternatesFor(path: string, locale: 'fr' | 'ar') {
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  const canonical = `${SITE_URL}/${locale}${clean}`;
  return {
    canonical,
    languages: {
      'fr-TN': `${SITE_URL}/fr${clean}`,
      'ar-TN': `${SITE_URL}/ar${clean}`,
      'x-default': `${SITE_URL}/fr${clean}`,
    },
  };
}

/**
 * Same as {@link localeAlternates} but keeps the CURRENT locale's canonical
 * (some pages have a locale-specific canonical by design) while still
 * declaring both hreflang variants.
 */
export function localeAlternatesWithCanonical(path: string, canonical: string) {
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return {
    canonical,
    languages: {
      'fr-TN': `${SITE_URL}/fr${clean}`,
      'ar-TN': `${SITE_URL}/ar${clean}`,
      'x-default': `${SITE_URL}/fr${clean}`,
    },
  };
}

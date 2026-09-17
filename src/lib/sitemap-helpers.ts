// 2026-09-17: Shared sitemap helpers for the split sitemap architecture.
// All sub-sitemaps (sitemap-static.xml, sitemap-resources-1.xml, etc.) share
// these helpers to ensure consistent hreflang, lastmod formatting, and XML escaping.
//
// Previously these helpers were inlined in src/app/sitemap.ts. Splitting the
// sitemap into multiple files required extracting them.

import { getCloudflareContext } from '@opennextjs/cloudflare';

export const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

export type SitemapPriority = number;
export type ChangeFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Get the D1 binding. Returns null if not in a CF Workers context
 * (e.g., during local dev or build).
 */
export async function getD1(): Promise<any | null> {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return (ctx as any).env?.DB ?? null;
  } catch (e) {
    return null;
  }
}

/**
 * Format a date for sitemap lastmod.
 * 2026-09-12: W3C Datetime format only accepts seconds-precision. Google Search
 * Console rejects sitemaps with milliseconds (.000Z). Strip them.
 */
export function toSitemapDate(d: Date | string | number | null | undefined): string {
  const date = d == null ? new Date() : new Date(d);
  if (isNaN(date.getTime())) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build a sitemap entry with hreflang alternates for FR + AR + x-default.
 *
 * @param path - URL path (with or without /fr or /ar prefix). The canonical
 *               URL is always the FR version.
 * @param priority - 0.0 to 1.0 (optional)
 * @param changeFrequency - 'daily' | 'weekly' | 'monthly' | 'yearly' (optional)
 */
export interface SitemapEntry {
  url: string;
  lastModified?: string;
  alternates?: {
    languages: Record<string, string>;
  };
  priority?: number;
  changeFrequency?: ChangeFreq;
}

export function withAlternates(
  path: string,
  priority?: SitemapPriority,
  changeFrequency?: ChangeFreq
): SitemapEntry {
  // Normalize: strip leading /fr/ or /ar/ to get the canonical path
  const canonicalPath = path
    .replace(/^https?:\/\/[^/]+/, '') // strip origin
    .replace(/^\/(fr|ar)(\/|$)/, '/') // strip locale prefix
    .replace(/\/$/, '') || '/';

  const frUrl = `${BASE_URL}/fr${canonicalPath === '/' ? '' : canonicalPath}`;
  const arUrl = `${BASE_URL}/ar${canonicalPath === '/' ? '' : canonicalPath}`;

  const entry: SitemapEntry = {
    url: frUrl,
    alternates: {
      languages: {
        'fr-TN': frUrl,
        'ar-TN': arUrl,
        'x-default': frUrl,
      },
    },
  };

  if (priority !== undefined) entry.priority = priority;
  if (changeFrequency) entry.changeFrequency = changeFrequency;

  return entry;
}

/**
 * Escape XML special characters in a string value.
 */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Static pages list (shared across the main sitemap and the static sub-sitemap).
 *
 * 2026-09-07: removed /recherche from sitemap — noindex in generateMetadata,
 * included here caused 7,448 bot visitors in 7 days on this single page.
 */
export function getStaticPageEntries(): SitemapEntry[] {
  return [
    { ...withAlternates('/', 1.0, 'daily'), lastModified: toSitemapDate(new Date()) },
    withAlternates('/a-propos', 0.5, 'monthly'),
    withAlternates('/contact', 0.5, 'monthly'),
    withAlternates('/cgu', 0.3, 'monthly'),
    withAlternates('/matieres', 0.8, 'weekly'),
    withAlternates('/niveaux', 0.8, 'weekly'),
    withAlternates('/college', 0.9, 'daily'),
    withAlternates('/concours-9eme-tunisie', 0.9, 'daily'),
    withAlternates('/concours-9eme-tunisie/sujets-passes', 0.8, 'daily'),
    withAlternates('/bac', 0.7, 'weekly'),
    withAlternates('/bac/archives', 0.6, 'monthly'),
    withAlternates('/professeurs', 0.5, 'monthly'),
    withAlternates('/faq', 0.5, 'monthly'),
    withAlternates('/referentiel-national', 0.5, 'monthly'),
  ];
}

/**
 * Compute popularity-based priority and changefreq for a resource.
 *
 * Engagement-weighted: views×1 + downloads×3 (downloads are 3× stronger signal).
 */
export function resourcePriority(views: number, downloads: number): {
  priority: number;
  changeFrequency: ChangeFreq;
} {
  const popularity = (views || 0) + (downloads || 0) * 3;
  const priority = popularity > 1000 ? 0.8 : popularity > 100 ? 0.7 : 0.6;
  const changeFrequency: ChangeFreq =
    popularity > 500 ? 'daily' : popularity > 50 ? 'weekly' : 'monthly';
  return { priority, changeFrequency };
}

/**
 * Resource entry with lastModified properly coerced from D1's numeric/string updatedAt.
 */
export function resourceEntry(
  numericId: number,
  slug: string,
  updatedAt: any,
  viewsCount: number,
  downloadsCount: number
): SitemapEntry {
  const { priority, changeFrequency } = resourcePriority(viewsCount, downloadsCount);
  const entry = withAlternates(`/ressources/${numericId}/${slug}`, priority, changeFrequency);

  if (updatedAt && typeof updatedAt === 'number' && updatedAt > 0) {
    entry.lastModified = toSitemapDate(updatedAt);
  } else if (updatedAt && typeof updatedAt === 'string') {
    entry.lastModified = toSitemapDate(updatedAt);
  } else {
    entry.lastModified = toSitemapDate(new Date());
  }

  return entry;
}

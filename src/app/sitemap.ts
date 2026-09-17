// 2026-09-17: Sitemap INDEX (not a urlset anymore).
// References all sub-sitemaps. Served at: https://examanet.com/sitemap.xml
//
// Splitting the sitemap into multiple files gives us:
// - Smaller individual files (faster crawl, less CF Worker CPU per request)
// - Different refresh cadences per content type
// - Easier debugging per content type
// - Better isolation if one sitemap generation fails
//
// Google sitemap index spec: https://developers.google.com/search/docs/specialty/sitemaps/index-sitemaps
//
// IMPORTANT: Only references sub-sitemaps that exist as separate routes
// (sitemap-static.xml/route.ts, sitemap-classes.xml/route.ts, etc.).
// When deploying, push sub-sitemaps FIRST so the index doesn't reference
// 404 URLs.

import type { MetadataRoute } from 'next';
import { BASE_URL, toSitemapDate } from '@/lib/sitemap-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Refresh hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // List of all sub-sitemaps. Google will crawl each one.
  // NOTE: Adding a sub-sitemap here requires the corresponding route file
  // to be deployed first.
  const subSitemaps = [
    { path: '/sitemap-static.xml', lastmod: new Date() },
    { path: '/sitemap-classes.xml', lastmod: new Date() },
    { path: '/sitemap-subjects.xml', lastmod: new Date() },
    { path: '/sitemap-teachers.xml', lastmod: new Date() },
    { path: '/sitemap-resources-1.xml', lastmod: new Date() },
    { path: '/sitemap-resources-2.xml', lastmod: new Date() },
    { path: '/sitemap-resources-3.xml', lastmod: new Date() },
    { path: '/image-sitemap.xml', lastmod: new Date() },
  ];

  return subSitemaps.map((s) => ({
    url: `${BASE_URL}${s.path}`,
    lastModified: toSitemapDate(s.lastmod),
  }));
}

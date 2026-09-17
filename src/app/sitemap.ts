// 2026-09-17: Sitemap INDEX.
// References all sub-sitemaps. Served at: https://examanet.com/sitemap.xml
//
// IMPORTANT: Sitemap indexes MUST use <sitemapindex> tag (not <urlset>).
// Next.js's built-in MetadataRoute.Sitemap always uses <urlset>, so we
// generate raw XML manually (like image-sitemap.xml/route.ts).
//
// Google sitemap index spec: https://developers.google.com/search/docs/specialty/sitemaps/index-sitemaps
//
// Splitting the sitemap into multiple files gives us:
// - Smaller individual files (faster crawl, less CF Worker CPU per request)
// - Different refresh cadences per content type
// - Easier debugging per content type
// - Better isolation if one sitemap generation fails
//
// DEPLOY ORDER:
// 1. Push sub-sitemaps first (so they exist when index references them)
// 2. Push index (which lists them)
// 3. Submit /sitemap.xml to Google Search Console

import { BASE_URL, toSitemapDate, xmlEscape } from '@/lib/sitemap-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Refresh hourly

export async function GET() {
  // List of all sub-sitemaps. Google will crawl each one.
  // NOTE: Adding a sub-sitemap here requires the corresponding route file
  // to be deployed first.
  const subSitemaps = [
    { path: '/sitemap-static.xml' },
    { path: '/sitemap-classes.xml' },
    { path: '/sitemap-subjects.xml' },
    { path: '/sitemap-teachers.xml' },
    { path: '/sitemap-resources-1.xml' },
    { path: '/sitemap-resources-2.xml' },
    { path: '/sitemap-resources-3.xml' },
    { path: '/image-sitemap.xml' },
  ];

  const now = toSitemapDate(new Date());
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${subSitemaps
  .map(
    (s) => `  <sitemap>
    <loc>${xmlEscape(BASE_URL)}${s.path}</loc>
    <lastmod>${now}</lastmod>
  </sitemap>`
  )
  .join('\n')}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}

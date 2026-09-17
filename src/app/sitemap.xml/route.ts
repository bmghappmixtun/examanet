// 2026-09-17: Sitemap INDEX.
// Served at: https://examanet.com/sitemap.xml
//
// Generates raw XML with proper <sitemapindex> format.
// Each <sitemap> entry references a deployed sub-sitemap.
//
// IMPORTANT: Do NOT also create src/app/sitemap.ts — Next.js treats both as the
// same URL /sitemap.xml and fails with "Duplicate export GET" if both exist.
//
// Sub-sitemap routes (must be deployed first):
//   /sitemap-static.xml      → src/app/sitemap-static.xml/route.ts
//   /sitemap-classes.xml     → src/app/sitemap-classes.xml/route.ts
//   /sitemap-subjects.xml    → src/app/sitemap-subjects.xml/route.ts
//   /sitemap-teachers.xml    → src/app/sitemap-teachers.xml/route.ts
//   /sitemap-resources-1.xml → src/app/sitemap-resources-1.xml/route.ts
//   /sitemap-resources-2.xml → src/app/sitemap-resources-2.xml/route.ts
//   /sitemap-resources-3.xml → src/app/sitemap-resources-3.xml/route.ts
//   /image-sitemap.xml       → src/app/image-sitemap.xml/route.ts

import { BASE_URL, sitemapCacheHeaders, toSitemapDate, xmlEscape } from '@/lib/sitemap-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export async function GET() {
  const subSitemaps = [
    '/sitemap-static.xml',
    '/sitemap-classes.xml',
    '/sitemap-subjects.xml',
    '/sitemap-teachers.xml',
    '/sitemap-resources-1.xml',
    '/sitemap-resources-2.xml',
    '/sitemap-resources-3.xml',
    '/image-sitemap.xml',
  ];

  const now = toSitemapDate(new Date());
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${subSitemaps
  .map(
    (path) => `  <sitemap>
    <loc>${xmlEscape(BASE_URL)}${path}</loc>
    <lastmod>${now}</lastmod>
  </sitemap>`
  )
  .join('\n')}
</sitemapindex>`;

  return new Response(xml, {
    headers: sitemapCacheHeaders(3600),
  });
}

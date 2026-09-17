// 2026-09-17: Resources sub-sitemap chunk 1 — top 5000 by engagement.
// Most popular resources (highest views + downloads). Refresh hourly so
// new popular content gets indexed fast.
// Served at: https://examanet.com/sitemap-resources-1.xml
import { buildResourcesSitemap } from '@/lib/build-resources-sitemap';
import { sitemapCacheHeaders } from '@/lib/sitemap-helpers';

export const revalidate = 3600; // Refresh hourly

export async function GET() {
  const xml = await buildResourcesSitemap(1);
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}

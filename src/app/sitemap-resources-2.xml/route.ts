// 2026-09-17: Resources sub-sitemap chunk 2 — next 5000 by engagement.
// Refresh daily.
import { buildResourcesSitemap } from '@/lib/build-resources-sitemap';
import { sitemapCacheHeaders } from '@/lib/sitemap-helpers';

export const revalidate = 86400; // Refresh daily

export async function GET() {
  const xml = await buildResourcesSitemap(2);
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, must-revalidate',
    },
  });
}

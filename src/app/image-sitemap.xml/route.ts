// @ts-nocheck
// 2026-09-07: Google Images sitemap
// Lists the top 100 most-viewed published resources with their thumbnails.
// Google can find thumbnails by crawling resource pages, but an explicit
// image sitemap speeds up Google Images indexing significantly.

import { getCloudflareContext } from '@opennextjs/cloudflare';

export const revalidate = 86400; // Refresh daily

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  let resources: any[] = [];
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (db) {
      const r: any = await db.prepare(`
        SELECT numericId, slug, thumbnailUrl, updatedAt
        FROM Resource
        WHERE status = 'PUBLISHED' AND isHidden = 0
          AND thumbnailUrl IS NOT NULL
        ORDER BY viewsCount DESC
        LIMIT 100
      `).all();
      resources = r?.results || [];
    }
  } catch (e) {
    console.error('[image-sitemap] error:', e);
  }

  // Build XML
  const urls = resources.map((r) => {
    const imgUrl = r.thumbnailUrl.startsWith('http') ? r.thumbnailUrl : `${baseUrl}${r.thumbnailUrl}`;
    const lastMod = r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString();
    return `  <url>
    <loc>${baseUrl}/fr/ressources/${r.numericId}/${r.slug}</loc>
    <lastmod>${lastMod}</lastmod>
    <image:image>
      <image:loc>${imgUrl}</image:loc>
    </image:image>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

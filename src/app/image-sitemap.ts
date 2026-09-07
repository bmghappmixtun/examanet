// @ts-nocheck
// 2026-09-07: Google Images sitemap
// Lists the top 100 most-viewed published resources with their thumbnails.
// Google can find thumbnails by crawling resource pages, but an explicit
// image sitemap speeds up Google Images indexing significantly.
//
// Limits: Google accepts up to 1,000 entries per sitemap; we cap at 100
// most-viewed to keep the file small and the index fresh.
import type { MetadataRoute } from 'next';
// 2026-09-03: Migrated to D1 direct
async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export const revalidate = 86400; // Refresh daily

export default async function imageSitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

  // Top 100 most-viewed published resources with thumbnails
  let resources: any[] = [];
  try {
    const db = await getD1();
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

  return resources.map((r) => ({
    url: `${baseUrl}/fr/ressources/${r.numericId}/${r.slug}`,
    lastModified: r.updatedAt ? new Date(r.updatedAt) : new Date(),
    images: [r.thumbnailUrl.startsWith('http')
      ? r.thumbnailUrl
      : `${baseUrl}${r.thumbnailUrl}`],
  }));
}

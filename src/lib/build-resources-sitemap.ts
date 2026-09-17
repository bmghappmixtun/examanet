// 2026-09-17: Builder for resources sub-sitemaps (1, 2, 3).
// Splits the ~15,400 published resources into 3 chunks by popularity:
//   - sitemap-resources-1: top 5000 by engagement (most important)
//   - sitemap-resources-2: next 5000
//   - sitemap-resources-3: remaining ~5,400 (low priority, indexed less often)

import { getD1, resourceEntry, xmlEscape } from '@/lib/sitemap-helpers';

export const RESOURCES_TOTAL = 15000; // approx
export const CHUNK_SIZE = 5000;

/**
 * Build a resources sub-sitemap XML.
 * @param chunk - 1, 2, or 3
 */
export async function buildResourcesSitemap(chunk: 1 | 2 | 3): Promise<string> {
  const offset = (chunk - 1) * CHUNK_SIZE;
  const limit = CHUNK_SIZE;

  const db = await getD1();
  let resources: any[] = [];
  if (db) {
    try {
      const r: any = await db
        .prepare(
          [
            'SELECT slug, numericId, updatedAt, viewsCount, downloadsCount',
            'FROM Resource',
            'WHERE status = ? AND isHidden = 0',
            'ORDER BY (COALESCE(viewsCount, 0) + COALESCE(downloadsCount, 0) * 3) DESC, updatedAt DESC',
            `LIMIT ? OFFSET ?`,
          ].join(' ')
        )
        .bind('PUBLISHED', limit, offset)
        .all();
      resources = (r?.results || []) as any[];
    } catch (e) {
      console.error(`[sitemap-resources-${chunk}] error:`, e);
    }
  }

  const entries = resources
    .filter((r) => r.numericId && r.slug)
    .map((r) => resourceEntry(r.numericId, r.slug, r.updatedAt, r.viewsCount, r.downloadsCount));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .map((e) => {
    const langs = Object.entries(e.alternates?.languages || {})
      .map(([lang, url]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(url)}"/>`)
      .join('\n');
    return `  <url>
    <loc>${xmlEscape(e.url)}</loc>${e.lastModified ? `\n    <lastmod>${e.lastModified}</lastmod>` : ''}${e.changeFrequency ? `\n    <changefreq>${e.changeFrequency}</changefreq>` : ''}${e.priority !== undefined ? `\n    <priority>${e.priority}</priority>` : ''}${langs ? `\n${langs}` : ''}
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return xml;
}

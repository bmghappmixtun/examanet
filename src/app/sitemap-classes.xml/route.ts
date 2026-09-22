// 2026-09-17: Classes (niveaux) sub-sitemap.
// Lists /niveaux/<slug> for each Class in D1 (~12 entries).
// Refresh: weekly.
import { getD1, sitemapCacheHeaders, withAlternates, xmlEscape, toSitemapDate } from '@/lib/sitemap-helpers';

export const revalidate = 86400; // Refresh daily (small dataset, cheap)

export async function GET() {
  const db = await getD1();
  let classes: any[] = [];
  if (db) {
    try {
      const r: any = await db.prepare('SELECT slug FROM `Class`').all();
      classes = (r?.results || []) as any[];
    } catch (e) {
      console.error('[sitemap-classes] error:', e);
    }
  }

  const entries = classes.map((c) => {
    const e = withAlternates(`/niveaux/${c.slug}`, 0.7, 'weekly');
    // 2026-09-22: Emit <lastmod> so GSC can prioritize crawling these
    // pages. They get refreshed regularly as resources are added.
    e.lastModified = toSitemapDate(new Date());
    return e;
  });

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

  return new Response(xml, {
    headers: sitemapCacheHeaders(86400),
  });
}

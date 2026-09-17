// 2026-09-17: Teachers sub-sitemap.
// Lists /professeurs/<numericId>/<slug> for ALL teachers with at least 1
// published resource.
//
// 2026-09-17 update: removed LIMIT 200. Now we have a dedicated sub-sitemap
// for teachers, so we include them all (currently ~2,400 teachers).
// Google's limit is 50,000 URLs per sitemap file, so we're well under.
//
// 2026-09-17 update: removed restriction on u.status = 'ACTIVE'. Teachers
// that were deactivated but still have published content are also indexed
// — their content is still valuable and should remain findable.
//
// Refresh: daily (cache TTL = 1 day). Teachers list changes infrequently.
import { getD1, sitemapCacheHeaders, withAlternates, xmlEscape } from '@/lib/sitemap-helpers';

export const revalidate = 86400; // Refresh daily

export async function GET() {
  const db = await getD1();
  let teachers: any[] = [];
  if (db) {
    try {
      const r: any = await db
        .prepare(
          [
            'SELECT u.id, u.numericId, u.slug',
            "FROM User u",
            "WHERE u.role = 'TEACHER'",
            // Only include teachers with at least one PUBLISHED resource —
            // otherwise their /professeurs/<id> page would be empty/bad UX.
            'AND EXISTS (SELECT 1 FROM Resource r WHERE r.teacherId = u.id AND r.status = ?)',
            // Order by resource count DESC: most prolific teachers get higher
            // sitemap priority for crawl efficiency.
            'ORDER BY (SELECT COUNT(*) FROM Resource r WHERE r.teacherId = u.id AND r.status = ?) DESC',
          ].join(' ')
        )
        .bind('PUBLISHED', 'PUBLISHED')
        .all();
      teachers = (r?.results || []) as any[];
    } catch (e) {
      console.error('[sitemap-teachers] error:', e);
    }
  }

  const entries = teachers
    .filter((t) => t.numericId && t.slug)
    .map((t) => withAlternates(`/professeurs/${t.numericId}/${t.slug}`, 0.5, 'monthly'));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .map((e) => {
    const langs = Object.entries(e.alternates?.languages || {})
      .map(([lang, url]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(url)}"/>`)
      .join('\n');
    return `  <url>
    <loc>${xmlEscape(e.url)}</loc>${e.changeFrequency ? `\n    <changefreq>${e.changeFrequency}</changefreq>` : ''}${e.priority !== undefined ? `\n    <priority>${e.priority}</priority>` : ''}${langs ? `\n${langs}` : ''}
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: sitemapCacheHeaders(86400),
  });
}

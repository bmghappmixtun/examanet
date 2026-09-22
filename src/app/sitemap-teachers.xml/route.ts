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
import { getD1, sitemapCacheHeaders, withAlternates, xmlEscape, toSitemapDate } from '@/lib/sitemap-helpers';

export const revalidate = 86400; // Refresh daily

export async function GET() {
  const db = await getD1();
  let teachers: any[] = [];
  if (db) {
    try {
      const r: any = await db
        .prepare(
          [
            // 2026-09-22: Added a correlated subquery for lastUpdatedAt
            // so the sitemap can emit <lastmod>. GSC drilldown 2026-09-22
            // showed 183 teacher URLs as "Discovered - currently not
            // indexed" (Dernière exploration = 1970-01-01). Root cause:
            // sitemap-teachers.xml had no <lastmod>, so Google had no
            // freshness signal and never crawled these URLs.
            //
            // Note: tried INNER JOIN + GROUP BY earlier but it returned
            // 0 rows in production (the D1 prepared statement didn't
            // handle the multiple binds correctly). Correlated subqueries
            // work because each only has 1 bind.
            'SELECT u.id, u.numericId, u.slug,',
            // Last update across all PUBLISHED resources of this teacher
            '(SELECT MAX(r.updatedAt) FROM Resource r WHERE r.teacherId = u.id AND r.status = ?) as lastUpdatedAt',
            "FROM User u",
            "WHERE u.role = 'TEACHER'",
            "AND EXISTS (SELECT 1 FROM Resource r WHERE r.teacherId = u.id AND r.status = ?)",
            // Order by resource count DESC: most prolific teachers get higher
            // sitemap priority for crawl efficiency.
            'ORDER BY (SELECT COUNT(*) FROM Resource r WHERE r.teacherId = u.id AND r.status = ?) DESC',
          ].join(' ')
        )
        .bind('PUBLISHED', 'PUBLISHED', 'PUBLISHED')
        .all();
      teachers = (r?.results || []) as any[];
    } catch (e) {
      console.error('[sitemap-teachers] error:', e);
    }
  }

  const entries = teachers
    .filter((t) => t.numericId && t.slug)
    .map((t) => {
      // 2026-09-22: Attach lastModified from the most-recent resource
      // update so the sitemap emits <lastmod>. Helps Google prioritize
      // crawling active teacher pages.
      const entry = withAlternates(`/professeurs/${t.numericId}/${t.slug}`, 0.5, 'monthly');
      // lastUpdatedAt is a millisecond-or-second timestamp; if it's 0 or
      // missing, fall back to "now" so the sitemap has SOME freshness
      // signal (never emit 1970-01-01 which Google would interpret as stale).
      const ts = t.lastUpdatedAt;
      entry.lastModified = ts && ts > 0 ? toSitemapDate(ts) : toSitemapDate(new Date());
      return entry;
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

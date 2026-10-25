// 2026-10-22: Class × filière landing pages sub-sitemap.
//
// WHY separate from sitemap-classes.xml: that one is the `/niveaux/[level]`
// sitemap driven by the `Level` table (only `college`, `lycee`, `bac`). This
// one is the `/classes/[classe]` tree driven by the `Class` table. Mixing them
// re-introduced the Leçon #91 bug (sitemap URLs that don't match real routes).
//
// THRESHOLD: as of 2026-10-22, 9 of the 19 filière pages have 0–7 published
// resources (the whole 3ème secondaire set is empty; the DB stores those
// resources under 1ere/2eme instead). Publishing those would create thin
// content, which is WORSE than no page for ranking. So:
//   - the 7 class hubs are always emitted (all have 1 000+ resources)
//   - a filière page is emitted only when it has >= MIN_RESOURCES resources
// The matching routes still exist and render (with a "bientôt" state + noindex)
// so the mega menu never 404s — they just stay out of the index until filled.
import { getD1, sitemapCacheHeaders, withAlternates, xmlEscape, toSitemapDate } from '@/lib/sitemap-helpers';
import { getClassPages, getSectionPages } from '@/lib/classes-seo';

export const revalidate = 86400; // Refresh daily

/** Same threshold as the `noindex` guard on the section route. */
export const MIN_SECTION_RESOURCES = 15;

export async function GET() {
  const entries: ReturnType<typeof withAlternates>[] = [];

  for (const c of getClassPages()) {
    const e = withAlternates(c.path, 0.8, 'weekly');
    e.lastModified = toSitemapDate(new Date());
    entries.push(e);
  }

  const sections = getSectionPages();

  const db = await getD1();
  if (db) {
    try {
      const placeholders = sections.map(() => '(?, ?)').join(',');
      const bindings: string[] = [];
      for (const s of sections) {
        bindings.push(s.classSlug, s.sectionSlug);
      }
      const r: any = await db
        .prepare(
          `SELECT cls.slug as classe, sec.slug as section, COUNT(*) as n
           FROM Resource r
           LEFT JOIN \`Class\` cls ON r.classId = cls.id
           LEFT JOIN \`Section\` sec ON r.sectionId = sec.id
           WHERE r.status = 'PUBLISHED' AND r.isHidden = 0
             AND (cls.slug, sec.slug) IN (${placeholders})
           GROUP BY cls.slug, sec.slug`,
        )
        .bind(...bindings)
        .all();

      const counts = new Map<string, number>();
      for (const row of r?.results || []) {
        counts.set(`${row.classe}|${row.section}`, row.n);
      }

      for (const s of sections) {
        const n = counts.get(`${s.classSlug}|${s.sectionSlug}`) || 0;
        if (n < MIN_SECTION_RESOURCES) continue;
        const e = withAlternates(s.path, 0.75, 'daily');
        e.lastModified = toSitemapDate(new Date());
        entries.push(e);
      }
    } catch (e: any) {
      console.error('[sitemap-class-section] error:', e?.message);
      // Fall through: emit the class hubs only, never a broken URL.
    }
  }

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
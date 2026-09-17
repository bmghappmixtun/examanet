// 2026-09-17: Subjects (matières) sub-sitemap.
// Lists /matieres/<slug> for each Subject in D1 (~50 entries).
// Refresh: weekly.
import { getD1, withAlternates, xmlEscape } from '@/lib/sitemap-helpers';

export const revalidate = 86400; // Refresh daily (small dataset)

export async function GET() {
  const db = await getD1();
  let subjects: any[] = [];
  if (db) {
    try {
      const r: any = await db.prepare('SELECT slug FROM `Subject`').all();
      subjects = (r?.results || []) as any[];
    } catch (e) {
      console.error('[sitemap-subjects] error:', e);
    }
  }

  const entries = subjects.map((s) => withAlternates(`/matieres/${s.slug}`, 0.7, 'weekly'));

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
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, must-revalidate',
    },
  });
}

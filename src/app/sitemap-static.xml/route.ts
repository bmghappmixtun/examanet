// 2026-09-17: Static pages sub-sitemap (14 hand-curated URLs).
// Refresh: daily (homepage), weekly/monthly for the rest.
// Served at: https://examanet.com/sitemap-static.xml
import { getStaticPageEntries, xmlEscape } from '@/lib/sitemap-helpers';

export const revalidate = 3600; // Refresh hourly

export async function GET() {
  const entries = getStaticPageEntries();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .map((e) => {
    const langs = Object.entries(e.alternates?.languages || {})
      .map(([lang, url]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(url)}"/>`)
      .join('\n');
    return `  <url>
    <loc>${xmlEscape(e.url)}</loc>
${e.lastModified ? `    <lastmod>${e.lastModified}</lastmod>\n` : ''}${e.changeFrequency ? `    <changefreq>${e.changeFrequency}</changefreq>\n` : ''}${e.priority !== undefined ? `    <priority>${e.priority}</priority>\n` : ''}${langs}
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}

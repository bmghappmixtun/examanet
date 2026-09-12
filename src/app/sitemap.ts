// @ts-nocheck
export const dynamic = 'force-dynamic';

import type { MetadataRoute } from 'next';
// 2026-09-03: Migrated to D1 direct
async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}


// 2026-09-12: Google Search Console rejects sitemap lastmod with milliseconds.
// W3C Datetime format only accepts seconds-precision. Return a STRING
// in YYYY-MM-DDThh:mm:ssZ format (no .000) to avoid Next.js auto-serializing
// Date objects with milliseconds.
function toSitemapDate(d: Date | string | number | null | undefined): string {
  const date = d == null ? new Date() : new Date(d);
  if (isNaN(date.getTime())) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  // Format as YYYY-MM-DDThh:mm:ssZ (no milliseconds)
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export const revalidate = 3600; // Refresh every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

  // SEO 2026-08-22: EVERY URL in the sitemap now gets hreflang alternates
  // pointing to both the FR and AR version of the same page. This is the
  // #1 issue from the SEO audit — previously only the 14 static pages
  // had hreflang, the 15,659 dynamic URLs had none, so Google couldn't
  // discover the AR version of resource/subject/teacher pages.
  //
  // The helper takes a URL (with or without /fr or /ar prefix) and emits
  // a Next.js sitemap entry with the proper alternates. URLs without a
  // locale prefix are treated as the canonical FR version.
  const withAlternates = (path: string, priority?: number, cf?: 'daily' | 'weekly' | 'monthly' | 'yearly') => {
    // Normalize: strip leading /fr/ or /ar/ to get the canonical path
    const canonicalPath = path
      .replace(/^https?:\/\/[^/]+/, '') // strip origin
      .replace(/^\/(fr|ar)(\/|$)/, '/') // strip locale prefix
      .replace(/\/$/, '') || '/';
    const frUrl = `${baseUrl}/fr${canonicalPath === '/' ? '' : canonicalPath}`;
    const arUrl = `${baseUrl}/ar${canonicalPath === '/' ? '' : canonicalPath}`;
    return {
      url: frUrl, // canonical = FR (default locale)
      alternates: {
        languages: {
          'fr-TN': frUrl,
          'ar-TN': arUrl,
          'x-default': frUrl,
        },
      },
      ...(priority !== undefined ? { priority } : {}),
      ...(cf ? { changeFrequency: cf } : {}),
    };
  };

  // Static pages — hand-curated
  const staticPages: MetadataRoute.Sitemap = [
    { ...withAlternates('/', 1.0, 'daily'), lastModified: toSitemapDate(new Date()) },
    withAlternates('/a-propos', 0.5, 'monthly'),
    withAlternates('/contact', 0.5, 'monthly'),
    withAlternates('/cgu', 0.3, 'monthly'),
    withAlternates('/matieres', 0.8, 'weekly'),
    withAlternates('/niveaux', 0.8, 'weekly'),
    withAlternates('/college', 0.9, 'daily'),
    withAlternates('/concours-9eme-tunisie', 0.9, 'daily'),
    withAlternates('/concours-9eme-tunisie/sujets-passes', 0.8, 'daily'),
    withAlternates('/bac', 0.7, 'weekly'),
    withAlternates('/bac/archives', 0.6, 'monthly'),
    withAlternates('/professeurs', 0.5, 'monthly'),
    withAlternates('/faq', 0.5, 'monthly'),
    // 2026-09-07: removed /recherche from sitemap — noindex in generateMetadata,
    // included here caused 7,448 bot visitors in 7 days on this single page.
    withAlternates('/referentiel-national', 0.5, 'monthly'),
  ];

  const db = await getD1();
  if (!db) return staticPages;
  // Subjects (matieres)
  let subjects: any[] = [];
  try {
    const subjectsRes: any = await db.prepare("SELECT slug FROM `Subject`").all();
    subjects = (subjectsRes?.results || []) as any[];
  } catch (e) {
    console.error('[sitemap] Subject query error:', e);
  }
  const subjectPages: MetadataRoute.Sitemap = subjects.map((s) =>
    withAlternates(`/matieres/${s.slug}`, 0.7, 'weekly')
  );

  // Classes (niveaux)
  let classes: any[] = [];
  try {
    const classesRes: any = await db.prepare("SELECT slug FROM `Class`").all();
    classes = (classesRes?.results || []) as any[];
  } catch (e) {
    console.error('[sitemap] Class query error:', e);
  }
  const classPages: MetadataRoute.Sitemap = classes.map((c) =>
    withAlternates(`/niveaux/${c.slug}`, 0.7, 'weekly')
  );

  // Teachers (top 200 by resource count)
  let teachers: any[] = [];
  try {
    const teachersRes2: any = await db.prepare([
      "SELECT u.id, u.numericId, u.slug",
      "FROM User u",
      "WHERE u.role = 'TEACHER' AND u.status = 'ACTIVE'",
      "AND EXISTS (SELECT 1 FROM Resource r WHERE r.teacherId = u.id AND r.status = 'PUBLISHED')",
      "ORDER BY (SELECT COUNT(*) FROM Resource r WHERE r.teacherId = u.id) DESC LIMIT 200",
    ].join(' ')).all();
    teachers = (teachersRes2?.results || []) as any[];
  } catch (e) {
    console.error('[sitemap] Teacher query error:', e);
  }
  const teacherPages: MetadataRoute.Sitemap = teachers.map((t) =>
    withAlternates(`/professeurs/${t.numericId}/${t.slug}`, 0.5, 'monthly')
  );

  // Resources - ALL published (Google accepts up to 50k per file)
  // 2026-09-03: Migrated to D1 direct
  let resources: any[] = [];
  try {
    const resourcesRes2: any = await db.prepare([
      "SELECT slug, numericId, updatedAt, type, viewsCount, downloadsCount",
      "FROM Resource",
      // 2026-09-05: also filter isHidden=0 so unpublished resources don't
      // appear in the sitemap (the teacher isHidden flag is the same one
      // the admin uses to hide a resource from the public site).
      "WHERE status = 'PUBLISHED' AND isHidden = 0",
      "ORDER BY updatedAt DESC",
    ].join(' ')).all();
    resources = (resourcesRes2?.results || []) as any[];
  } catch (e) {
    console.error('[sitemap] Resource query error:', e);
  }
  const resourcePages: MetadataRoute.Sitemap = resources.map((r) => {
    // Quality-based priority: popular resources get higher priority
    const popularity = (r.viewsCount || 0) + (r.downloadsCount || 0) * 3;
    const priority = popularity > 1000 ? 0.8 : popularity > 100 ? 0.7 : 0.6;
    const changeFrequency: 'daily' | 'weekly' | 'monthly' =
      popularity > 500 ? 'daily' : popularity > 50 ? 'weekly' : 'monthly';
    // 2026-09-12: lastModified must be a valid Date for Google sitemaps.
    // r.updatedAt from D1 can be a number (ms), null, or 0. Always coerce
    // to a proper Date, falling back to current time if invalid.
    // Strip milliseconds — Google Search Console rejects W3C Datetime with .ms
    let lastModified: Date;
    if (r.updatedAt && typeof r.updatedAt === 'number' && r.updatedAt > 0) {
      lastModified = toSitemapDate(r.updatedAt);
    } else if (r.updatedAt && typeof r.updatedAt === 'string') {
      lastModified = toSitemapDate(r.updatedAt);
    } else {
      lastModified = toSitemapDate(new Date());
    }
    return {
      ...withAlternates(`/ressources/${r.numericId}/${r.slug}`, priority, changeFrequency),
      lastModified,
    };
  });

  return [...staticPages, ...subjectPages, ...classPages, ...teacherPages, ...resourcePages];
}

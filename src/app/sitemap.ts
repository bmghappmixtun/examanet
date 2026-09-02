// @ts-nocheck
export const dynamic = 'force-dynamic';

import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

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
    { ...withAlternates('/', 1.0, 'daily'), lastModified: new Date() },
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
    withAlternates('/recherche', 0.5, 'monthly'),
    withAlternates('/referentiel-national', 0.5, 'monthly'),
  ];

  // Subjects (matieres)
  const subjects = await prisma.subject.findMany({
    select: { slug: true },
  });
  const subjectPages: MetadataRoute.Sitemap = subjects.map((s) =>
    withAlternates(`/matieres/${s.slug}`, 0.7, 'weekly')
  );

  // Classes (niveaux)
  const classes = await prisma.class.findMany({
    select: { slug: true },
  });
  const classPages: MetadataRoute.Sitemap = classes.map((c) =>
    withAlternates(`/niveaux/${c.slug}`, 0.7, 'weekly')
  );

  // Teachers (top 200 by resource count)
  const teachers = await prisma.user.findMany({
    where: { uploadedFiles: { some: {} } },
    select: { id: true, numericId: true, slug: true },
    take: 200,
  });
  const teacherPages: MetadataRoute.Sitemap = teachers.map((t) =>
    withAlternates(`/professeurs/${t.numericId}/${t.slug}`, 0.5, 'monthly')
  );

  // Resources - ALL published (Google accepts up to 50k per file)
  // We currently have ~15k so 1 file is enough
  const resources = await prisma.resource.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      slug: true,
      numericId: true,
      updatedAt: true,
      type: true,
      viewsCount: true,
      downloadsCount: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  const resourcePages: MetadataRoute.Sitemap = resources.map((r) => {
    // Quality-based priority: popular resources get higher priority
    const popularity = (r.viewsCount || 0) + (r.downloadsCount || 0) * 3;
    const priority = popularity > 1000 ? 0.8 : popularity > 100 ? 0.7 : 0.6;
    const changeFrequency: 'daily' | 'weekly' | 'monthly' =
      popularity > 500 ? 'daily' : popularity > 50 ? 'weekly' : 'monthly';
    return {
      ...withAlternates(`/ressources/${r.numericId}/${r.slug}`, priority, changeFrequency),
      lastModified: r.updatedAt,
    };
  });

  return [...staticPages, ...subjectPages, ...classPages, ...teacherPages, ...resourcePages];
}

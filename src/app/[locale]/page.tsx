// @ts-nocheck
import type { Metadata } from 'next';
import { unstable_cache as nextCache } from 'next/cache';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import HomeClient from '@/components/home/HomeClient';
import { itemListSchema } from '@/lib/structured-data';
import { localeAlternatesFor } from '@/lib/seo-alternates';
import { getLocale } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

// PERF 2026-09-02: Migrated from Prisma to D1 direct.
// The original used Prisma + Hyperdrive which returned empty data.
// Now uses D1 directly with unstable_cache (5 min TTL) for performance.

const REVALIDATE_S = 300;

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

const getCachedHomeData = nextCache(
  async () => {
    const db = await getD1();
    if (!db) return { popular: [], recent: [], stats: { resources: 0, teachers: 0, students: 0, downloads: 0 }, subjects: [] };

    // Popular resources (by views)
    const popularResult: any = await db.prepare(`
      SELECT r.id, r.numericId, r.slug, r.title, r.description, r.summary, r.type, r.year,
             r.hasCorrection, r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount, r.publishedAt,
             r.subjectId, r.classId, r.sectionId, r.teacherId, r.thumbnailUrl, r.thumbnailKey,
             s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.nameAr as s_nameAr, s.color as s_color, s.icon as s_icon,
             c.id as c_id, c.slug as c_slug, c.nameFr as c_nameFr,
             sec.id as sec_id, sec.slug as sec_slug, sec.nameFr as sec_nameFr,
             t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName,
             t.firstNameAr as t_firstNameAr, t.lastNameAr as t_lastNameAr,
             t.avatarUrl as t_avatarUrl
      FROM Resource r
      LEFT JOIN \`Subject\` s ON r.subjectId = s.id
      LEFT JOIN \`Class\` c ON r.classId = c.id
      LEFT JOIN \`Section\` sec ON r.sectionId = sec.id
      LEFT JOIN \`User\` t ON r.teacherId = t.id
      WHERE r.status = 'PUBLISHED' AND r.isHidden = 0
      ORDER BY r.viewsCount DESC, r.publishedAt DESC
      LIMIT 8
    `).all();

    // Recent resources
    const recentResult: any = await db.prepare(`
      SELECT r.id, r.numericId, r.slug, r.title, r.description, r.summary, r.type, r.year,
             r.hasCorrection, r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount, r.publishedAt,
             r.subjectId, r.classId, r.sectionId, r.teacherId, r.thumbnailUrl, r.thumbnailKey,
             s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.nameAr as s_nameAr, s.color as s_color, s.icon as s_icon,
             c.id as c_id, c.slug as c_slug, c.nameFr as c_nameFr,
             sec.id as sec_id, sec.slug as sec_slug, sec.nameFr as sec_nameFr,
             t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName,
             t.firstNameAr as t_firstNameAr, t.lastNameAr as t_lastNameAr,
             t.avatarUrl as t_avatarUrl
      FROM Resource r
      LEFT JOIN \`Subject\` s ON r.subjectId = s.id
      LEFT JOIN \`Class\` c ON r.classId = c.id
      LEFT JOIN \`Section\` sec ON r.sectionId = sec.id
      LEFT JOIN \`User\` t ON r.teacherId = t.id
      WHERE r.status = 'PUBLISHED' AND r.isHidden = 0
      ORDER BY r.publishedAt DESC
      LIMIT 8
    `).all();

    // Stats (parallel)
    const [totalResources, totalTeachers, totalStudents, totalDownloads] = await Promise.all([
      db.prepare("SELECT COUNT(*) as c FROM Resource WHERE status = 'PUBLISHED'").first(),
      db.prepare("SELECT COUNT(*) as c FROM User WHERE role = 'TEACHER' AND status = 'ACTIVE'").first(),
      db.prepare("SELECT COUNT(*) as c FROM User WHERE role = 'STUDENT' AND status = 'ACTIVE'").first(),
      db.prepare("SELECT COALESCE(SUM(downloadsCount), 0) as s FROM Resource WHERE status = 'PUBLISHED'").first(),
    ]);

    // Subjects
    const subjectsResult: any = await db.prepare(
      "SELECT id, slug, nameFr, nameAr, icon, color, `order` FROM `Subject` ORDER BY `order` ASC"
    ).all();

    return {
      popular: (popularResult?.results || []).map(formatResource),
      recent: (recentResult?.results || []).map(formatResource),
      stats: {
        resources: totalResources?.c || 0,
        teachers: totalTeachers?.c || 0,
        students: totalStudents?.c || 0,
        downloads: totalDownloads?.s || 0,
      },
      subjects: (subjectsResult?.results || []),
    };
  },
  ['home-data-d1-v4'],
  { revalidate: REVALIDATE_S, tags: ['home', 'resources', 'subjects'] },
);

// Format a resource row to match Prisma's include format
function formatResource(r: any) {
  return {
    id: r.id,
    numericId: r.numericId,
    slug: r.slug,
    title: r.title,
    description: r.description,
    summary: r.summary,
    type: r.type,
    year: r.year,
    hasCorrection: !!r.hasCorrection,
    viewsCount: r.viewsCount || 0,
    downloadsCount: r.downloadsCount || 0,
    avgRating: r.avgRating || 0,
    ratingCount: r.ratingsCount || 0,  // Map D1's ratingsCount to component's expected ratingCount
    commentsCount: r.commentsCount || 0,
    favoritesCount: r.favoritesCount || 0,
    publishedAt: r.publishedAt,
    subjectId: r.subjectId,
    classId: r.classId,
    sectionId: r.sectionId,
    teacherId: r.teacherId,
    thumbnailUrl: r.thumbnailUrl,
    thumbnailKey: r.thumbnailKey,
    subject: r.s_id ? {
      id: r.s_id, slug: r.s_slug, nameFr: r.s_nameFr, nameAr: r.s_nameAr,
      color: r.s_color, icon: r.s_icon,
    } : null,
    class: r.c_id ? {
      id: r.c_id, slug: r.c_slug, nameFr: r.c_nameFr,
    } : null,
    section: r.sec_id ? {
      id: r.sec_id, slug: r.sec_slug, nameFr: r.sec_nameFr,
    } : null,
    teacher: r.t_id ? {
      id: r.t_id, firstName: r.t_firstName, lastName: r.t_lastName,
      firstNameAr: r.t_firstNameAr, lastNameAr: r.t_lastNameAr,
      avatarUrl: r.t_avatarUrl,
    } : null,
  };
}

// SEO 2026-10-25 : la home était un `export const metadata` STATIQUE, donc
// 100 % français : /ar servait le titre « Examanet — La plateforme
// pédagogique #1 en Tunisie » et son canonical pointait sur /fr. Passé en
// `generateMetadata` pour que le titre, la description, l'og:url et le
// canonical suivent la locale.
//
// ⚠️ Ne JAMAIS exporter `metadata` ET `generateMetadata` sur la même page
// (Next.js throw : "metadata and generateMetadata cannot be exported at the
// same time") — d'où la suppression du `export const metadata` ci-dessous.
export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as 'fr' | 'ar';
  const isAr = locale === 'ar';

  return {
    // 2026-09-07: Added explicit title. Was relying on inherited root title
    // (which now uses `template: '%s | Examanet'` since we removed noindex).
    title: isAr
      ? 'إكسامانت — المنصة التربوية #1 في تونس'
      : 'Examanet — La plateforme pédagogique #1 en Tunisie',
    description: isAr
      ? 'المنصة التربوية التونسية #1: دروس، فروض، تمارين، سلاسل، ملخصات، مواضيع باكالوريا وإصلاحات للابتدائي، الإعدادي والثانوي. مجانية 100%.'
      : 'Plateforme pédagogique #1 pour les élèves tunisiens : cours, devoirs, exercices, sujets de bac et corrigés pour le Collège et le Lycée. Gratuit.',
    alternates: localeAlternatesFor('/', locale),
    openGraph: {
      title: isAr
        ? 'إكسامانت — المنصة التربوية #1 في تونس'
        : 'Examanet — La plateforme pédagogique #1 en Tunisie',
      description: isAr
        ? 'المنصة التربوية التونسية #1: دروس، فروض، تمارين، سلاسل، ملخصات، مواضيع باكالوريا وإصلاحات للابتدائي، الإعدادي والثانوي. مجانية 100%.'
        : 'Plateforme pédagogique #1 pour les élèves tunisiens : cours, devoirs, exercices, sujets de bac et corrigés. Gratuit.',
      url: `/${locale}`,
      locale: isAr ? 'ar_TN' : 'fr_TN',
      type: 'website',
    },
  };
}

export const revalidate = 300;

async function getHomeData() {
  return await getCachedHomeData();
}

export default async function HomePage() {
  let homeData: any;
  try {
    homeData = await getHomeData();
  } catch (e: any) {
    console.error('[HOME] getHomeData failed:', e?.message, e?.stack);
    return <div style={{padding: 40}}>Home data error: {e?.message || 'unknown'}</div>;
  }
  const { popular, recent, subjects, stats } = homeData;
  // 2026-09-07: ItemList JSON-LD for popular resources on the homepage.
  // Helps Google show a "popular items" carousel in SERPs.
  let popularListJsonLd: any = null;
  try {
    popularListJsonLd = popular && popular.length > 0
      ? itemListSchema({
          name: 'Ressources populaires sur Examanet',
          description: 'Les ressources les plus consultées sur Examanet — cours, exercices, sujets et corrigés pour le système éducatif tunisien.',
          url: `${SITE_URL}/`,
          items: popular.slice(0, 10).map((r: any) => ({
            name: r.title,
            url: `${SITE_URL}/fr/ressources/${r.numericId || r.id}/${r.slug}`,
            description: r.description || r.summary || undefined,
          })),
        })
      : null;
  } catch (e: any) {
    console.error('[HOME] itemListSchema failed:', e?.message);
  }
  return (
    <>
      {popularListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(popularListJsonLd) }}
        />
      )}
      <HomeClient popular={popular} recent={recent} subjects={subjects} stats={stats} />
    </>
  );
}

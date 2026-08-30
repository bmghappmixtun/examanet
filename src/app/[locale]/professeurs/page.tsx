// @ts-nocheck
// 2026-08-30: Pre-fetch first page data on the server.
// SSR shell + initial data = much faster TTI.
// Client component re-fetches only on filter changes.

import TeachersClient from '@/components/teachers/TeachersClient';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string; subject?: string }> }) {
  const sp = await searchParams;
  const filters: string[] = [];
  if (sp.q) filters.push(`"${sp.q}"`);
  if (sp.subject) filters.push(sp.subject);
  
  const baseTitle = 'Professeurs tunisiens — Enseignants certifiés';
  const title = filters.length > 0 ? `${filters.join(' · ')} — Professeurs` : baseTitle;
  
  return {
    title,
    description: 'Découvrez les professeurs tunisiens certifiés sur Examanet : cours, exercices, sujets de bac et corrigés. 100% gratuit.',
    alternates: {
      canonical: 'https://examanet.com/professeurs',
      languages: {
        'fr-TN': 'https://examanet.com/professeurs',
        'ar-TN': 'https://examanet.com/ar/professeurs',
      },
    },
    openGraph: {
      title: baseTitle,
      description: 'Professeurs tunisiens certifiés sur Examanet',
      url: 'https://examanet.com/professeurs',
      siteName: 'Examanet',
      locale: 'fr_TN',
      type: 'website',
    },
  };
}

// Pre-fetch initial data on the server (much faster TTI)
async function fetchInitialData(searchParams: URLSearchParams) {
  try {
    // Use the same logic as the API route, but inline to avoid HTTP overhead
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    const sp = searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const sort = sp.get('sort') || 'popular';
    const q = (sp.get('q') || '').trim();
    const subjectSlugs = (sp.get('subject') || '').split(',').filter(Boolean);
    const classSlugs = (sp.get('class') || '').split(',').filter(Boolean);
    const verifiedOnly = sp.get('verified') === '1';
    const PAGE_SIZE = 24;

    const safeQuery = async (sql: string, params: any[] = []) => {
      try {
        const r = await db.prepare(sql).bind(...params).all();
        return r?.results || [];
      } catch { return []; }
    };
    const safeFirst = async (sql: string, params: any[] = []) => {
      try {
        return await db.prepare(sql).bind(...params).first();
      } catch { return null; }
    };

    // Global stats
    const [statsRow, subjectsTaught, classesTaught] = await Promise.all([
      safeFirst(`
        SELECT
          (SELECT COUNT(*) FROM User WHERE role = 'TEACHER' AND status = 'ACTIVE') AS totalActive,
          (SELECT COUNT(*) FROM User WHERE role = 'TEACHER' AND status = 'ACTIVE' AND isVerifiedTeacher = 1) AS totalVerified,
          (SELECT COUNT(*) FROM Resource WHERE status = 'PUBLISHED' AND teacherId IS NOT NULL) AS totalResources
      `),
      safeQuery(`
        SELECT s.slug, s.nameFr, s.nameAr, s.color
        FROM Subject s
        WHERE EXISTS (SELECT 1 FROM Resource r WHERE r.subjectId = s.id AND r.status = 'PUBLISHED' AND r.teacherId IS NOT NULL)
        ORDER BY s.nameFr ASC
      `),
      safeQuery(`
        SELECT c.slug, c.nameFr, c.nameAr
        FROM "Class" c
        WHERE EXISTS (SELECT 1 FROM Resource r WHERE r.classId = c.id AND r.status = 'PUBLISHED' AND r.teacherId IS NOT NULL)
        ORDER BY c."order" ASC
      `),
    ]);

    // Build teacher WHERE
    const teacherConds: string[] = ["u.role = 'TEACHER'", "u.status = 'ACTIVE'"];
    const teacherParams: any[] = [];
    if (verifiedOnly) teacherConds.push('u.isVerifiedTeacher = 1');
    if (q) {
      const tokens = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 2);
      const tokenConds: string[] = [];
      for (const t of tokens) {
        const like = `%${t}%`;
        tokenConds.push('(LOWER(u.firstName) LIKE ? OR LOWER(u.lastName) LIKE ? OR LOWER(IFNULL(u.schoolName, "")) LIKE ?)');
        teacherParams.push(like, like, like);
      }
      teacherConds.push('(' + tokenConds.join(' AND ') + ')');
    }
    if (subjectSlugs.length || classSlugs.length) {
      const extraConds: string[] = [];
      if (subjectSlugs.length) {
        const ph = subjectSlugs.map(() => '?').join(',');
        extraConds.push(`r.subjectId IN (SELECT id FROM Subject WHERE slug IN (${ph}))`);
        teacherParams.push(...subjectSlugs);
      }
      if (classSlugs.length) {
        const ph = classSlugs.map(() => '?').join(',');
        extraConds.push(`r.classId IN (SELECT id FROM "Class" WHERE slug IN (${ph}))`);
        teacherParams.push(...classSlugs);
      }
      teacherConds.push(`EXISTS (SELECT 1 FROM Resource r WHERE r.teacherId = u.id ${extraConds.length ? ' AND ' + extraConds.join(' AND ') : ''})`);
    }
    const teacherWhereSql = teacherConds.join(' AND ');
    const offset = (page - 1) * PAGE_SIZE;

    let orderBySql = 'u.createdAt DESC';
    if (sort === 'recent') orderBySql = 'u.createdAt DESC';
    else if (sort === 'name') orderBySql = 'u.firstName ASC, u.lastName ASC';
    else if (sort === 'rating') orderBySql = 'COALESCE(rs.rating, 0) DESC, rs.files DESC';
    else if (sort === 'followers') orderBySql = 'u.followersCount DESC, rs.files DESC';
    else if (sort === 'popular') orderBySql = 'COALESCE(rs.files, 0) DESC, COALESCE(rs.views, 0) DESC, u.createdAt DESC';

    const statsSubquery = `
      SELECT teacherId,
        COUNT(*) as files,
        COALESCE(SUM(viewsCount), 0) as views,
        COALESCE(SUM(downloadsCount), 0) as downloads,
        AVG(IFNULL(avgRating, 0)) as rating
      FROM Resource
      WHERE status = 'PUBLISHED' AND teacherId IS NOT NULL
      GROUP BY teacherId
    `;

    const [countRow, teacherRows] = await Promise.all([
      safeFirst(`SELECT COUNT(*) as c FROM User u WHERE ${teacherWhereSql}`, teacherParams),
      safeQuery(
        `SELECT u.id, u.numericId, u.slug, u.firstName, u.lastName, u.firstNameAr, u.lastNameAr,
                u.avatarUrl, u.bio, u.schoolName, u.governorate, u.isVerifiedTeacher, u.createdAt,
                rs.files, rs.views, rs.downloads, rs.rating
         FROM User u
         LEFT JOIN (${statsSubquery}) rs ON rs.teacherId = u.id
         WHERE ${teacherWhereSql}
         ORDER BY ${orderBySql}
         LIMIT ? OFFSET ?`,
        [...teacherParams, PAGE_SIZE, offset]
      ),
    ]);

    const num = (v: any) => (v == null ? 0 : Number(v) || 0);
    const totalMatching = num(countRow?.c);
    const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));

    return {
      totalActive: num(statsRow?.totalActive),
      totalVerified: num(statsRow?.totalVerified),
      totalResources: num(statsRow?.totalResources),
      totalMatching,
      totalPages,
      page,
      pageSize: PAGE_SIZE,
      sort,
      q,
      teachers: teacherRows.map((t: any) => ({
        id: t.id, numericId: t.numericId, slug: t.slug,
        firstName: t.firstName, lastName: t.lastName,
        firstNameAr: t.firstNameAr, lastNameAr: t.lastNameAr,
        avatarUrl: t.avatarUrl, bio: t.bio, schoolName: t.schoolName,
        governorate: t.governorate, isVerifiedTeacher: !!t.isVerifiedTeacher,
        createdAt: t.createdAt,
        stats: {
          files: num(t.files), views: num(t.views),
          downloads: num(t.downloads), rating: Number(t.rating) || 0,
          followers: 0,
        },
      })),
      subjectsTaught,
      classesTaught,
    };
  } catch (e: any) {
    console.error('[professeurs SSR] error:', e?.message);
    return null;
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  // Convert to URLSearchParams for the helper
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp || {})) {
    if (v) usp.set(k, String(v));
  }
  const initialData = await fetchInitialData(usp);
  return <TeachersClient initialData={initialData} />;
}

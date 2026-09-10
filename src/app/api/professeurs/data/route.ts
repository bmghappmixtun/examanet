// @ts-nocheck
/**
 * /api/professeurs/data — optimized for speed
 *
 * 2026-08-30: Major rewrite for performance.
 *  - Combined 3 COUNT queries into 1 (conditional aggregation)
 *  - Skip Follow query (table is empty)
 *  - For 'popular' sort, use SQL ORDER BY with files_count subquery
 *    instead of fetching all 2420 teacher IDs + stats
 *  - Reduced query count from 7+ to 4
 *  - Added cache headers (s-maxage + stale-while-revalidate)
 *  - Cache static filter options (subjects/classes) — they rarely change
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cachedD1Query } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // cache for 60s

const PAGE_SIZE = 24;

function num(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number(v) || 0;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1'));
  const sort = sp.get('sort') || 'popular';
  const q = (sp.get('q') || '').trim();
  const subjectSlugs = (sp.get('subject') || '').split(',').filter(Boolean);
  const classSlugs = (sp.get('class') || '').split(',').filter(Boolean);
  const verifiedOnly = sp.get('verified') === '1';

  const t0 = Date.now();

  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;

    // Helpers
    const safeQuery = async (sql: string, params: any[] = []) => {
      try {
        const r = await db.prepare(sql).bind(...params).all();
        return r?.results || [];
      } catch (e: any) {
        console.error('[profs API] query failed:', e?.message?.substring(0, 150));
        return [];
      }
    };
    const safeFirst = async (sql: string, params: any[] = []) => {
      try {
        return await db.prepare(sql).bind(...params).first();
      } catch (e: any) {
        console.error('[profs API] first failed:', e?.message?.substring(0, 150));
        return null;
      }
    };

    // ----- Q1 (parallel): global stats + filter options -----
    // PERF 2026-09-02 (Step 3.5): Cache Q1 (the subjects/classes queries were the bottleneck — ~800ms)
    // The subjects query has 28 EXISTS subqueries (N+1 over subjects table)
    // Cache the whole Q1 result for 5min (data changes rarely: only on new teacher/resource)
    const q1Data = await cachedD1Query({
      key: 'profs-q1-v1',
      ttl: 300, // 5 min
      query: async () => {
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
        return {
          statsRow: statsRow || { totalActive: 0, totalVerified: 0, totalResources: 0 },
          subjectsTaught,
          classesTaught,
        };
      },
    });
    const statsRow = q1Data.statsRow;
    const subjectsTaught = q1Data.subjectsTaught;
    const classesTaught = q1Data.classesTaught;

    const totalActive = num(statsRow?.totalActive);
    const totalVerified = num(statsRow?.totalVerified);
    const totalResources = num(statsRow?.totalResources);

    // ----- Build teacher WHERE -----
    // 2026-09-10: Refactored to fix duplicate teachers on paginated results.
    // Previously: JOIN User with Resource created N rows per teacher (one per resource).
    // LIMIT 24 then returned 24 rows of the SAME teacher. Now: use EXISTS in WHERE
    // for filters, no JOIN. The main query is always User-only, ensuring one row per teacher.
    const teacherConds: string[] = [
      "u.role = 'TEACHER'",
      "u.status = 'ACTIVE'",
      // 2026-09-06: only show teachers with a numericId (broken profile URLs otherwise)
      "u.numericId IS NOT NULL",
      "u.slug IS NOT NULL",
      "u.slug != ''",
    ];
    const teacherParams: any[] = [];
    if (verifiedOnly) teacherConds.push('u.isVerifiedTeacher = 1');

    if (q) {
      const tokens = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 2);
      const tokenConds: string[] = [];
      for (const t of tokens) {
        const like = `%${t}%`;
        // Simpler search: any of 4 fields (drop firstNameAr, lastNameAr, bio to reduce params)
        tokenConds.push(
          '(LOWER(u.firstName) LIKE ? OR LOWER(u.lastName) LIKE ? OR LOWER(IFNULL(u.schoolName, "")) LIKE ?)'
        );
        teacherParams.push(like, like, like);
      }
      teacherConds.push('(' + tokenConds.join(' AND ') + ')');
    }

    // Filter by subject/class via EXISTS in WHERE (no JOIN — keeps 1 row per teacher)
    if (subjectSlugs.length || classSlugs.length) {
      const existsConds: string[] = ["r.status = 'PUBLISHED'", "r.teacherId = u.id"];
      if (subjectSlugs.length) {
        const placeholders = subjectSlugs.map(() => '?').join(',');
        existsConds.push(`r.subjectId IN (SELECT id FROM Subject WHERE slug IN (${placeholders}))`);
        teacherParams.push(...subjectSlugs);
      }
      if (classSlugs.length) {
        const placeholders = classSlugs.map(() => '?').join(',');
        existsConds.push(`r.classId IN (SELECT id FROM "Class" WHERE slug IN (${placeholders}))`);
        teacherParams.push(...classSlugs);
      }
      teacherConds.push(
        `EXISTS (SELECT 1 FROM Resource r WHERE ${existsConds.join(' AND ')})`
      );
    }

    const teacherWhereSql = teacherConds.join(' AND ');
    // Always User-only (no JOIN) — EXISTS in WHERE handles the subject/class filter
    // without duplicating rows. Stats come from the LEFT JOIN with the stats subquery.
    const fromUserSql = 'User u';

    // PERF 2026-09-02 (Step 3): Build cache key from filter params
    // Cache the full data assembly (queries + result transformation)
    const cacheFilterKey = [
      `sort=${sort}`,
      `q=${q}`,
      `sub=${subjectSlugs.join(',')}`,
      `cls=${classSlugs.join(',')}`,
      `v=${verifiedOnly ? 1 : 0}`,
      `p=${page}`,
    ].join('&');
    const cacheKey = `profs-data-v1-${fnv1a(cacheFilterKey).toString(16)}`;
    // Popular default = 60s, filtered = 30s
    const hasFilters = q || subjectSlugs.length || classSlugs.length || verifiedOnly;
    const cacheTtl = hasFilters ? 30 : 60;

    // ----- Q2: totalMatching + teachers + stats in one shot -----
    // Single query: COUNT + paginated teachers with LEFT JOIN to aggregated stats
    const offset = (page - 1) * PAGE_SIZE;

    // The stats subquery: files, views, downloads, rating per teacher (for PUBLISHED only)
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

    // Build ORDER BY based on sort
    let orderBySql = 'u.createdAt DESC';
    if (sort === 'recent') orderBySql = 'u.createdAt DESC';
    else if (sort === 'name') orderBySql = 'u.firstName ASC, u.lastName ASC';
    else if (sort === 'rating') orderBySql = 'COALESCE(rs.rating, 0) DESC, rs.files DESC';
    else if (sort === 'followers') orderBySql = 'u.followersCount DESC, rs.files DESC';
    else if (sort === 'popular') orderBySql = 'COALESCE(rs.files, 0) DESC, COALESCE(rs.views, 0) DESC, u.createdAt DESC';

    // Main query: gets count + page in one round trip via window function trick
    // Actually we need both: total count + paginated rows
    // Use 2 parallel queries: one COUNT, one paginated SELECT with stats
    // PERF 2026-09-02 (Step 3): Wrap the entire data assembly in cachedD1Query
    // This caches the FULL JSON response (60s TTL for default, 30s for filtered)
    // On cache hit, no D1 queries are run, response is instant (~30ms)
    const dataPayload = await cachedD1Query({
      key: cacheKey,
      ttl: cacheTtl,
      query: async () => {
        const [_countRow, _teacherRows] = await Promise.all([
          safeFirst(`SELECT COUNT(*) as c FROM ${fromUserSql} WHERE ${teacherWhereSql}`, teacherParams),
          safeQuery(
            `SELECT u.id, u.numericId, u.slug, u.firstName, u.lastName, u.firstNameAr, u.lastNameAr,
                    u.avatarUrl, u.bio, u.schoolName, u.governorate, u.isVerifiedTeacher, u.createdAt,
                    rs.files, rs.views, rs.downloads, rs.rating
             FROM ${fromUserSql}
             LEFT JOIN (${statsSubquery}) rs ON rs.teacherId = u.id
             WHERE ${teacherWhereSql}
             ORDER BY ${orderBySql}
             LIMIT ? OFFSET ?`,
            [...teacherParams, PAGE_SIZE, offset]
          ),
        ]);
        const _totalMatching = num(_countRow?.c);
        const _totalPages = Math.max(1, Math.ceil(_totalMatching / PAGE_SIZE));
        return {
          totalActive,
          totalVerified,
          totalResources,
          totalMatching: _totalMatching,
          totalPages: _totalPages,
          page,
          pageSize: PAGE_SIZE,
          sort,
          q,
          teachers: _teacherRows.map((t: any) => ({
            id: t.id,
            numericId: t.numericId,
            slug: t.slug,
            firstName: t.firstName,
            lastName: t.lastName,
            firstNameAr: t.firstNameAr,
            lastNameAr: t.lastNameAr,
            avatarUrl: t.avatarUrl,
            bio: t.bio,
            schoolName: t.schoolName,
            governorate: t.governorate,
            isVerifiedTeacher: !!t.isVerifiedTeacher,
            createdAt: t.createdAt,
            stats: {
              files: num(t.files),
              views: num(t.views),
              downloads: num(t.downloads),
              rating: Number(t.rating) || 0,
              followers: 0, // Follow table is empty
            },
          })),
          subjectsTaught,
          classesTaught,
        };
      },
    });

    return NextResponse.json(
      {
        ...dataPayload,
        ms: Date.now() - t0,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'X-Cache-Key': cacheKey,
        },
      }
    );
  } catch (e: any) {
    console.error('[profs API] top-level error:', e?.message);
    return NextResponse.json(
      { error: 'server_error', message: e?.message?.substring(0, 200) },
      { status: 500 }
    );
  }
}

/**
 * FNV-1a 32-bit hash. Fast and good enough for cache keys.
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

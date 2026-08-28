// @ts-nocheck
// 2026-08-28: D1-direct API for /fr/professeurs.
// Bypasses prisma-compat race condition on CF Workers.

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

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

  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;

    // Safe query helpers (each query isolated)
    async function safeQuery(sql: string, params: any[] = []): Promise<any[]> {
      try {
        const r = await db.prepare(sql).bind(...params).all();
        return r.results || [];
      } catch (e: any) {
        console.error('[profs API] query failed:', e?.message?.substring(0, 150));
        return [];
      }
    }
    async function safeFirst(sql: string, params: any[] = []): Promise<any> {
      try {
        return await db.prepare(sql).bind(...params).first();
      } catch (e: any) {
        console.error('[profs API] first failed:', e?.message?.substring(0, 150));
        return null;
      }
    }

    // ----- BATCH 1: global stats + filter options -----
    const batch1 = await Promise.all([
      safeFirst("SELECT COUNT(*) as c FROM User WHERE role = 'TEACHER' AND status = 'ACTIVE'"),
      safeFirst("SELECT COUNT(*) as c FROM User WHERE role = 'TEACHER' AND status = 'ACTIVE' AND isVerifiedTeacher = 1"),
      safeFirst("SELECT COUNT(*) as c FROM Resource WHERE status = 'PUBLISHED' AND teacherId IS NOT NULL"),
      safeQuery(`SELECT DISTINCT s.slug, s.nameFr, s.nameAr, s.color FROM Subject s INNER JOIN Resource r ON r.subjectId = s.id WHERE r.status = 'PUBLISHED' AND r.teacherId IS NOT NULL ORDER BY s.nameFr ASC`),
      safeQuery(`SELECT DISTINCT cl.slug, cl.nameFr, cl.nameAr FROM [Class] cl INNER JOIN Resource r ON r.classId = cl.id WHERE r.status = 'PUBLISHED' AND r.teacherId IS NOT NULL ORDER BY cl.[order] ASC`),
    ]);
    const totalActive = num(batch1[0]?.c);
    const totalVerified = num(batch1[1]?.c);
    const totalResources = num(batch1[2]?.c);
    const subjectsTaught = (batch1[3] || []).map((s: any) => ({
      slug: s.slug, nameFr: s.nameFr, nameAr: s.nameAr, color: s.color,
    }));
    const classesTaught = (batch1[4] || []).map((c: any) => ({
      slug: c.slug, nameFr: c.nameFr, nameAr: c.nameAr,
    }));

    // ----- Build teacher WHERE -----
    const teacherConds: string[] = ["role = 'TEACHER'", "status = 'ACTIVE'"];
    const teacherParams: any[] = [];
    if (verifiedOnly) teacherConds.push('isVerifiedTeacher = 1');

    if (q) {
      const tokens = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 2);
      const tokenConds: string[] = [];
      for (const t of tokens) {
        const like = `%${t}%`;
        tokenConds.push('(' +
          'LOWER(firstName) LIKE ? OR ' +
          'LOWER(lastName) LIKE ? OR ' +
          'LOWER(IFNULL(firstNameAr, "")) LIKE ? OR ' +
          'LOWER(IFNULL(lastNameAr, "")) LIKE ? OR ' +
          'LOWER(IFNULL(schoolName, "")) LIKE ? OR ' +
          'LOWER(IFNULL(bio, "")) LIKE ?' +
          ')');
        for (let i = 0; i < 6; i++) teacherParams.push(like);
      }
      teacherConds.push('(' + tokenConds.join(' AND ') + ')');
    }

    // ----- Filter by subject/class via resource existence -----
    let allowedTeacherIds: string[] | null = null;
    if (subjectSlugs.length || classSlugs.length) {
      const resConds: string[] = ["status = 'PUBLISHED'", "teacherId IS NOT NULL"];
      const resParams: any[] = [];
      if (subjectSlugs.length) {
        const placeholders = subjectSlugs.map(() => '?').join(',');
        resConds.push(`subjectId IN (SELECT id FROM Subject WHERE slug IN (${placeholders}))`);
        resParams.push(...subjectSlugs);
      }
      if (classSlugs.length) {
        const placeholders = classSlugs.map(() => '?').join(',');
        resConds.push(`classId IN (SELECT id FROM [Class] WHERE slug IN (${placeholders}))`);
        resParams.push(...classSlugs);
      }
      const groups = await safeQuery(
        `SELECT DISTINCT teacherId FROM Resource WHERE ${resConds.join(' AND ')}`,
        resParams
      );
      allowedTeacherIds = groups.map((g: any) => g.teacherId).filter((id: any) => id !== null);
      if (allowedTeacherIds.length === 0) {
        return NextResponse.json({
          totalActive, totalVerified, totalResources,
          totalMatching: 0, totalPages: 1, page, pageSize: PAGE_SIZE,
          sort, q,
          teachers: [], subjectsTaught, classesTaught,
        });
      }
      const placeholders = allowedTeacherIds.map(() => '?').join(',');
      teacherConds.push(`id IN (${placeholders})`);
      teacherParams.push(...allowedTeacherIds);
    }

    const teacherWhereSql = teacherConds.join(' AND ');

    // ----- Total matching count -----
    // If the query has an IN clause with many IDs, batch the query
    let totalMatching = 0;
    const inMatch2 = teacherWhereSql.match(/(.*)id IN \((.+)\)$/);
    if (inMatch2 && teacherParams.length > 100) {
      const inIds = teacherParams;
      const beforeIn = inMatch2[1];
      const BATCH = 100;
      const countPromises: Promise<any>[] = [];
      for (let i = 0; i < inIds.length; i += BATCH) {
        const batch = inIds.slice(i, i + BATCH);
        const placeholders = batch.map(() => '?').join(',');
        countPromises.push(safeFirst(`SELECT COUNT(*) as c FROM User WHERE ${beforeIn}id IN (${placeholders})`, batch));
      }
      const countResults = await Promise.all(countPromises);
      totalMatching = countResults.reduce((acc, r) => acc + num(r?.c), 0);
    } else {
      const totalRow = await safeFirst(`SELECT COUNT(*) as c FROM User WHERE ${teacherWhereSql}`, teacherParams);
      totalMatching = num(totalRow?.c);
    }
    const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));

    // ----- BATCH 2: teachers + per-teacher stats -----
    const useManualSort = ['popular', 'rating', 'followers'].includes(sort);
    
    let teacherRows: any[] = [];
    let statsMap: Map<string, any> = new Map();
    
    if (!useManualSort) {
      let orderBySql = 'createdAt DESC';
      if (sort === 'name') orderBySql = 'firstName ASC, lastName ASC';
      const offset = (page - 1) * PAGE_SIZE;
      
      const teachersRes = await safeQuery(
        `SELECT id, numericId, slug, firstName, lastName, firstNameAr, lastNameAr,
          avatarUrl, bio, schoolName, governorate, isVerifiedTeacher, createdAt
        FROM User WHERE ${teacherWhereSql}
        ORDER BY ${orderBySql}
        LIMIT ? OFFSET ?`,
        [...teacherParams, PAGE_SIZE, offset]
      );
      teacherRows = teachersRes;
      
      if (teacherRows.length > 0) {
        const ids = teacherRows.map((t: any) => t.id);
        statsMap = await getTeacherStats(db, ids);
      }
    } else {
      // Get all matching teacher IDs (no pagination yet)
      // If many IDs, batch the query
      let allIds: any[] = [];
      const baseWhere = teacherWhereSql; // role, status, [id IN if filtered]
      const baseParams = teacherParams;
      
      // If the query has an IN clause with many IDs, split it
      const inMatch = baseWhere.match(/(.*)id IN \((.+)\)$/);
      if (inMatch && baseParams.length > 100) {
        const inIds = baseParams;
        const beforeIn = inMatch[1];
        const BATCH = 100;
        for (let i = 0; i < inIds.length; i += BATCH) {
          const batch = inIds.slice(i, i + BATCH);
          const placeholders = batch.map(() => '?').join(',');
          const batchIds = await safeQuery(
            `SELECT id FROM User WHERE ${beforeIn}id IN (${placeholders})`,
            batch
          );
          allIds = allIds.concat(batchIds);
        }
      } else {
        allIds = await safeQuery(`SELECT id FROM User WHERE ${baseWhere}`, baseParams);
      }
      const allIdList = allIds.map((r: any) => r.id);

      
      if (allIdList.length > 0) {
        // Get stats for ALL matching teachers
        statsMap = await getTeacherStats(db, allIdList);

        
        // Sort by metric
        const sorted = [...allIdList].sort((a, b) => {
          const sa = statsMap.get(a) || { files: 0, avg: 0, followers: 0 };
          const sb = statsMap.get(b) || { files: 0, avg: 0, followers: 0 };
          if (sort === 'popular') return sb.files - sa.files;
          if (sort === 'rating') return sb.rating - sa.rating;
          if (sort === 'followers') return sb.followers - sa.followers;
          return 0;
        });
        
        // Paginate
        const offset = (page - 1) * PAGE_SIZE;
        const paginatedIds = sorted.slice(offset, offset + PAGE_SIZE);
        
        if (paginatedIds.length > 0) {
          const placeholders = paginatedIds.map(() => '?').join(',');
          teacherRows = await safeQuery(
            `SELECT id, numericId, slug, firstName, lastName, firstNameAr, lastNameAr,
              avatarUrl, bio, schoolName, governorate, isVerifiedTeacher, createdAt
            FROM User WHERE id IN (${placeholders})`,
            paginatedIds
          );
          // Preserve sort order
          const orderMap = new Map(paginatedIds.map((id: string, i: number) => [id, i]));
          teacherRows.sort((a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
          
        }
      }
    }

    return NextResponse.json({
      totalActive,
      totalVerified,
      totalResources,
      totalMatching,
      totalPages,
      page,
      pageSize: PAGE_SIZE,
      sort,
      q,
      teachers: teacherRows.map((t: any) => ({
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
        stats: statsMap.get(t.id) || null,
      })),
      subjectsTaught,
      classesTaught,
    });
  } catch (e: any) {
    console.error('[profs API] top-level error:', e?.message);
    return NextResponse.json({ error: 'server_error', message: e?.message?.substring(0, 200) }, { status: 500 });
  }
}

async function getTeacherStats(db: any, teacherIds: string[]): Promise<Map<string, any>> {
  if (teacherIds.length === 0) return new Map();
  
  // D1 has 999 SQL variable limit. Batch queries to stay under.
  const BATCH_SIZE = 50;
  const batches: string[][] = [];
  for (let i = 0; i < teacherIds.length; i += BATCH_SIZE) {
    batches.push(teacherIds.slice(i, i + BATCH_SIZE));
  }
  
  async function safeAll(sql: string, params: any[] = []): Promise<any[]> {
    try {
      const r = await db.prepare(sql).bind(...params).all();
      return r.results || [];
    } catch (e: any) {
      console.error('[profs API] stats query failed:', e?.message?.substring(0, 100));
      return [];
    }
  }
  
  // Run batches in parallel (D1 supports concurrent reads)
  // Process 4 batches at a time to avoid overwhelming the connection
  const allResults: any[][] = [];
  const PARALLEL_BATCHES = 4;
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const batchGroup = batches.slice(i, i + PARALLEL_BATCHES);
    const groupResults = await Promise.all(
      batchGroup.map(async (batch) => {
        const placeholders = batch.map(() => '?').join(',');
        const [statsRes, followRes] = await Promise.all([
          safeAll(
            `SELECT teacherId, COUNT(*) as files, SUM(IFNULL(viewsCount, 0)) as views, SUM(IFNULL(downloadsCount, 0)) as downloads, AVG(IFNULL(avgRating, 0)) as rating FROM Resource WHERE status = 'PUBLISHED' AND teacherId IN (${placeholders}) GROUP BY teacherId`,
            batch
          ),
          safeAll(
            `SELECT followingId, COUNT(*) as c FROM Follow WHERE followingId IN (${placeholders}) GROUP BY followingId`,
            batch
          ),
        ]);
        return [statsRes, followRes];
      })
    );
    for (const [statsRes, followRes] of groupResults) {
      allResults.push(statsRes, followRes);
    }
  }
  
  const map = new Map<string, any>();
  // Even-indexed results are stats, odd are follows
  for (let i = 0; i < allResults.length; i += 2) {
    const statsRes = allResults[i];
    const followRes = allResults[i + 1] || [];
    for (const r of statsRes) {
      if (!r.teacherId) continue;
      map.set(r.teacherId, {
        files: num(r.files),
        views: num(r.views),
        downloads: num(r.downloads),
        rating: Number(r.rating) || 0,
        followers: 0,
      });
    }
    for (const f of followRes) {
      const ex = map.get(f.followingId);
      if (ex) ex.followers = num(f.c);
    }
  }
  return map;
}

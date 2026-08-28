// @ts-nocheck
// 2026-08-28: D1-direct API for matiere subject page.
// Bypasses prisma-compat race condition on CF Workers.
// Returns ALL data the client component needs in a single request.

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';


const PAGE_SIZE = 24;

function num(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number(v) || 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: subjectSlug } = await params;
  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') || '1'));
  const sort = sp.get('sort') || 'recent';
  const spType = sp.get('type') || '';
  const spAnnee = sp.get('annee') || '';
  const spSection = sp.get('section') || '';
  const spTrimestre = sp.get('trimestre') || '';
  const spProf = sp.get('prof') || '';

  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;

    // 1. Subject
    const subject: any = await db.prepare(
      "SELECT id, numericId, slug, nameFr, nameAr, color, icon, \"order\" FROM Subject WHERE slug = ? LIMIT 1"
    ).bind(subjectSlug).first();

    if (!subject) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // 2. Build WHERE clause
    const conds: string[] = ["r.subjectId = ?", "r.status = 'PUBLISHED'"];
    const params: any[] = [subject.id];

    if (spType) {
      conds.push('r.type = ?');
      params.push(spType);
    }
    if (spTrimestre) {
      conds.push('r.trimester = ?');
      params.push(spTrimestre);
    }
    if (spProf) {
      conds.push('r.teacherId = ?');
      params.push(spProf);
    }
    if (spAnnee) {
      conds.push("r.classId IN (SELECT id FROM \"Class\" WHERE slug = ?)");
      params.push(spAnnee);
    }
    if (spSection) {
      conds.push("r.sectionId IN (SELECT id FROM Section WHERE slug = ?)");
      params.push(spSection);
    }

    // 3. Sort
    let orderBySql = 'r.publishedAt DESC';
    if (sort === 'popular') orderBySql = 'r.viewsCount DESC';
    if (sort === 'downloads') orderBySql = 'r.downloadsCount DESC';
    if (sort === 'favorites') orderBySql = 'r.favoritesCount DESC';

    const whereSql = conds.join(' AND ');

    // 4. Total count
    const totalRow: any = await db.prepare(
      `SELECT COUNT(*) as c FROM Resource r WHERE ${whereSql}`
    ).bind(...params).first();
    const totalCount = num(totalRow?.c);

    // 5. Facets (parallel)
    const facetWhere = "r.subjectId = ? AND r.status = 'PUBLISHED'";
    const subWhere = "subjectId = ? AND status = 'PUBLISHED'";
    const facetParams = [subject.id];

    // Facets: each in its own try/catch so one failure doesn't break the others
    async function safeQuery(sql: string, params: any[] = []): Promise<any> {
      try { 
        const r = await db.prepare(sql).bind(...params).all(); 
        return r.results || []; 
      } catch (e: any) { 
        console.error("[matieres data] query failed:", e?.message?.substring(0, 100), "SQL:", sql.substring(0, 80));
        return []; 
      }
    }
    async function safeFirst(sql: string, params: any[] = []): Promise<any> {
      try { 
        return await db.prepare(sql).bind(...params).first(); 
      } catch (e: any) { 
        console.error("[matieres data] first query failed:", e?.message?.substring(0, 100));
        return null; 
      }
    }
    
    const [byTypeRes, byTrimestreRes, byClassRes, bySectionRes, byProfRes, classesRes, sectionsRes, teachersRes] = await Promise.all([
      safeQuery("SELECT type, COUNT(*) as c FROM Resource r WHERE " + facetWhere + " GROUP BY type", facetParams),
      safeQuery("SELECT trimester, COUNT(*) as c FROM Resource r WHERE " + facetWhere + " AND trimester IS NOT NULL GROUP BY trimester", facetParams),
      safeQuery("SELECT cl.id as id, cl.slug as slug, cl.nameFr as nameFr, cl.nameAr as nameAr, cl.[order] as class_order, COUNT(r.id) as count FROM Resource r INNER JOIN [Class] cl ON r.classId = cl.id WHERE " + facetWhere + " GROUP BY cl.id, cl.slug, cl.nameFr, cl.nameAr, cl.[order] ORDER BY cl.[order] ASC", facetParams),
      safeQuery("SELECT sec.id as id, sec.slug as slug, sec.nameFr as nameFr, sec.nameAr as nameAr, COUNT(r.id) as count FROM Resource r INNER JOIN Section sec ON r.sectionId = sec.id WHERE " + facetWhere + " GROUP BY sec.id, sec.slug, sec.nameFr, sec.nameAr ORDER BY sec.nameFr ASC", facetParams),
      safeQuery("SELECT t.id as id, t.firstName, t.lastName, t.firstNameAr, t.lastNameAr, t.avatarUrl, t.schoolName, COUNT(r.id) as count FROM Resource r INNER JOIN User t ON r.teacherId = t.id WHERE " + facetWhere + " AND t.role = 'TEACHER' AND t.status = 'ACTIVE' GROUP BY t.id, t.firstName, t.lastName, t.firstNameAr, t.lastNameAr, t.avatarUrl, t.schoolName ORDER BY count DESC LIMIT 30", facetParams),
      safeQuery("SELECT cl.id, cl.slug, cl.nameFr, cl.nameAr, cl.[order] FROM [Class] cl WHERE cl.id IN (SELECT DISTINCT classId FROM Resource WHERE " + subWhere + " AND classId IS NOT NULL) ORDER BY cl.[order] ASC", facetParams),
      safeQuery("SELECT sec.id, sec.slug, sec.nameFr, sec.nameAr FROM Section sec WHERE sec.id IN (SELECT DISTINCT sectionId FROM Resource WHERE " + subWhere + " AND sectionId IS NOT NULL) ORDER BY sec.nameFr ASC LIMIT 100", facetParams),
      safeQuery("SELECT t.id, t.firstName, t.lastName, t.firstNameAr, t.lastNameAr, t.avatarUrl, t.schoolName FROM User t WHERE t.id IN (SELECT DISTINCT teacherId FROM Resource WHERE " + subWhere + " AND teacherId IS NOT NULL) AND t.role = 'TEACHER' AND t.status = 'ACTIVE' ORDER BY t.firstName ASC LIMIT 30", facetParams),
    ]);

    // 6. Main resources query (paginated) - single LEFT JOIN
    const offset = (page - 1) * PAGE_SIZE;
    const resourcesRes: any = await db.prepare(`
      SELECT
        r.id, r.numericId, r.slug, r.title, r.type, r.status, r.subjectId, r.classId, r.sectionId,
        r.teacherId, r.year, r.trimester, r.schoolType, r.hasCorrection, r.isFeatured,
        r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount, r.commentsCount, r.favoritesCount,
        r.publishedAt, r.createdAt, r.fileKey, r.fileUrl, r.fileSize, r.pageCount, r.thumbnailUrl,
        cl.slug as class_slug, cl.nameFr as class_nameFr, cl.nameAr as class_nameAr,
        sec.slug as section_slug, sec.nameFr as section_nameFr,
        t.firstName as teacher_firstName, t.lastName as teacher_lastName, t.numericId as teacher_numericId, t.slug as teacher_slug
      FROM Resource r
      LEFT JOIN \`Class\` cl ON r.classId = cl.id
      LEFT JOIN Section sec ON r.sectionId = sec.id
      LEFT JOIN User t ON r.teacherId = t.id
      WHERE ${whereSql}
      ORDER BY ${orderBySql}
      LIMIT ? OFFSET ?
    `).bind(...params, PAGE_SIZE, offset).all();

    // 7. Related subjects
    const relatedRes: any = await db.prepare(
      "SELECT id, numericId, slug, nameFr, nameAr FROM Subject WHERE id != ? AND slug != ? ORDER BY \"order\" ASC LIMIT 8"
    ).bind(subject.id, subjectSlug).all();

    return NextResponse.json({
      subject: {
        id: subject.id,
        numericId: subject.numericId,
        slug: subject.slug,
        nameFr: subject.nameFr,
        nameAr: subject.nameAr,
        color: subject.color,
        icon: subject.icon,
        order: subject.order,
      },
      resources: (resourcesRes.results || []).map((r: any) => ({
        id: r.id,
        numericId: r.numericId,
        slug: r.slug,
        title: r.title,
        type: r.type,
        status: r.status,
        subjectId: r.subjectId,
        classId: r.classId,
        sectionId: r.sectionId,
        teacherId: r.teacherId,
        year: r.year,
        trimester: r.trimester,
        schoolType: r.schoolType,
        hasCorrection: !!r.hasCorrection,
        isFeatured: !!r.isFeatured,
        viewsCount: num(r.viewsCount),
        downloadsCount: num(r.downloadsCount),
        avgRating: Number(r.avgRating) || 0,
        ratingsCount: num(r.ratingsCount),
        commentsCount: num(r.commentsCount),
        favoritesCount: num(r.favoritesCount),
        publishedAt: r.publishedAt ? new Date(r.publishedAt * 1000).toISOString() : null,
        fileKey: r.fileKey,
        fileUrl: r.fileUrl,
        fileSize: num(r.fileSize),
        pageCount: num(r.pageCount),
        thumbnailUrl: r.thumbnailUrl,
        class: r.class_slug ? { slug: r.class_slug, nameFr: r.class_nameFr, nameAr: r.class_nameAr } : null,
        section: r.section_slug ? { slug: r.section_slug, nameFr: r.section_nameFr } : null,
        teacher: r.teacher_firstName ? {
          firstName: r.teacher_firstName,
          lastName: r.teacher_lastName,
          numericId: r.teacher_numericId,
          slug: r.teacher_slug,
        } : null,
        // Add subject so ResourceCard can render it (all resources on this page share the same subject)
        subject: {
          slug: subject.slug,
          nameFr: subject.nameFr,
          nameAr: subject.nameAr,
          color: subject.color,
          icon: subject.icon,
        },
      })),
      totalCount,
      page,
      pageSize: PAGE_SIZE,
      facets: {
        byType: (byTypeRes || []).map((r: any) => ({ value: r.type, count: num(r.c) })),
        byTrimestre: (byTrimestreRes || []).map((r: any) => ({ value: r.trimester, count: num(r.c) })),
        byClass: (byClassRes || []).map((r: any) => ({
          slug: r.slug, nameFr: r.nameFr, nameAr: r.nameAr, count: num(r.count)
        })),
        bySection: (bySectionRes || []).map((r: any) => ({
          slug: r.slug, nameFr: r.nameFr, nameAr: r.nameAr, count: num(r.count)
        })),
        byProf: (byProfRes || []).map((r: any) => ({
          id: r.id,
          firstName: r.firstName, lastName: r.lastName,
          firstNameAr: r.firstNameAr, lastNameAr: r.lastNameAr,
          avatarUrl: r.avatarUrl, schoolName: r.schoolName,
          count: num(r.count),
        })),
      },
      classes: (classesRes || []).map((r: any) => ({
        id: r.id, slug: r.slug, nameFr: r.nameFr, nameAr: r.nameAr, order: num(r.order)
      })),
      sections: (sectionsRes || []).map((r: any) => ({
        id: r.id, slug: r.slug, nameFr: r.nameFr, nameAr: r.nameAr
      })),
      teachers: (teachersRes || []).map((r: any) => ({
        id: r.id, firstName: r.firstName, lastName: r.lastName,
        firstNameAr: r.firstNameAr, lastNameAr: r.lastNameAr,
        avatarUrl: r.avatarUrl, schoolName: r.schoolName,
      })),
      relatedSubjects: (relatedRes.results || []).map((r: any) => ({
        id: r.id, numericId: r.numericId, slug: r.slug, nameFr: r.nameFr, nameAr: r.nameAr
      })),
    });
  } catch (e: any) {
    console.error('[matieres/[slug]/data] error:', e?.message);
    return NextResponse.json({ error: 'server_error', message: e?.message }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SORT_OPTIONS = ['relevance', 'recent', 'popular', 'downloads', 'rating'] as const;

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const params = req.nextUrl.searchParams;
  const q = params.get('q') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(params.get('limit') || '12')));
  const sort = (params.get('sort') || 'relevance') as (typeof SORT_OPTIONS)[number];

  // Filters
  const subjectId = params.get('subject');
  const classId = params.get('class');
  const teacherId = params.get('teacher');
  const sectionId = params.get('section');
  const type = params.get('type');
  const year = params.get('year');
  const hasCorrection = params.get('hasCorrection');
  const homeworkSubtype = params.get('homeworkSubtype');
  const schoolType = params.get('schoolType');

  try {
    const db = await getD1();
    if (!db) {
      return NextResponse.json({ error: 'DB not available' }, { status: 503 });
    }

    // Build WHERE
    // 2026-09-05: also filter isHidden=0 to hide unpublished resources
    const conditions: string[] = ["r.status = 'PUBLISHED'", "r.isHidden = 0"];
    const binds: any[] = [];

    if (q) {
      const like = `%${q}%`;
      conditions.push('(r.title LIKE ? OR r.description LIKE ? OR r.summary LIKE ?)');
      binds.push(like, like, like);
    }
    if (subjectId) {
      conditions.push('r.subjectId = ?');
      binds.push(subjectId);
    }
    if (classId) {
      conditions.push('r.classId = ?');
      binds.push(classId);
    }
    if (teacherId) {
      conditions.push('r.teacherId = ?');
      binds.push(teacherId);
    }
    if (sectionId) {
      conditions.push('r.sectionId = ?');
      binds.push(sectionId);
    }
    if (type) {
      conditions.push('r.type = ?');
      binds.push(type);
    }
    if (year) {
      conditions.push('r.year = ?');
      binds.push(year);
    }
    if (hasCorrection === 'true') {
      conditions.push('r.hasCorrection = 1');
    } else if (hasCorrection === 'false') {
      conditions.push('r.hasCorrection = 0');
    }
    if (homeworkSubtype && ['CONTROLE', 'SYNTHESE', 'MAISON', 'REVISION'].includes(homeworkSubtype)) {
      conditions.push('r.homeworkSubtype = ?');
      binds.push(homeworkSubtype);
    }
    if (schoolType && ['PUBLIC', 'PRIVATE', 'PILOTE'].includes(schoolType)) {
      conditions.push('r.schoolType = ?');
      binds.push(schoolType);
    }

    const whereClause = conditions.join(' AND ');
    const offset = (page - 1) * limit;

    // ORDER BY
    const orderBy = sort === 'recent' ? 'r.publishedAt DESC' :
                    sort === 'popular' ? 'r.viewsCount DESC' :
                    sort === 'downloads' ? 'r.downloadsCount DESC' :
                    sort === 'rating' ? 'r.avgRating DESC, r.ratingsCount DESC' :
                    'r.publishedAt DESC';

    // Count query
    const countSql = `SELECT COUNT(*) as total FROM Resource r WHERE ${whereClause}`;
    const countResult: any = await db.prepare(countSql).bind(...binds).first();
    const total = countResult?.total || 0;

    // Main query with joins
    const resourcesSql = [
      'SELECT',
      '  r.id, r.numericId, r.slug, r.title, r.description, r.type, r.year, r.trimester,',
      '  r.language, r.hasCorrection, r.viewsCount, r.downloadsCount,',
      '  r.avgRating, r.ratingsCount, r.publishedAt,',
      '  s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.color as s_color,',
      '  c.id as c_id, c.slug as c_slug, c.nameFr as c_nameFr,',
      '  sec.id as sec_id, sec.slug as sec_slug, sec.nameFr as sec_nameFr,',
      '  t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName',
      'FROM Resource r',
      'LEFT JOIN `Subject` s ON r.subjectId = s.id',
      'LEFT JOIN `Class` c ON r.classId = c.id',
      'LEFT JOIN `Section` sec ON r.sectionId = sec.id',
      'LEFT JOIN `User` t ON r.teacherId = t.id',
      'WHERE ' + whereClause,
      'ORDER BY ' + orderBy,
      'LIMIT ? OFFSET ?',
    ].join('\n');
    
    const resourcesResult = await db.prepare(resourcesSql).bind(...binds, limit, offset).all();
    const resources = resourcesResult?.results || [];

    return NextResponse.json({
      query: q,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      sort,
      filters: {
        subjectId, classId, teacherId, sectionId, type, year,
        fromDate: null, toDate: null,
        hasCorrection: hasCorrection === 'true' ? true : hasCorrection === 'false' ? false : null,
        homeworkSubtype, schoolType,
      },
      results: resources.map((r: any) => ({
        id: r.id,
        numericId: r.numericId,
        slug: r.slug,
        title: r.title,
        description: r.description,
        type: r.type,
        year: r.year,
        trimester: r.trimester,
        language: r.language,
        hasCorrection: !!r.hasCorrection,
        viewsCount: r.viewsCount || 0,
        downloadsCount: r.downloadsCount || 0,
        avgRating: r.avgRating || 0,
        ratingCount: r.ratingsCount || 0,
        publishedAt: r.publishedAt,
        subject: r.s_id ? { id: r.s_id, slug: r.s_slug, nameFr: r.s_nameFr, color: r.s_color } : null,
        class: r.c_id ? { id: r.c_id, slug: r.c_slug, nameFr: r.c_nameFr } : null,
        section: r.sec_id ? { id: r.sec_id, slug: r.sec_slug, nameFr: r.sec_nameFr } : null,
        teacher: r.t_id ? { id: r.t_id, firstName: r.t_firstName, lastName: r.t_lastName } : null,
      })),
      facets: {
        subjects: [],
        types: [],
        classes: [],
        years: [],
      },
      durationMs: Date.now() - start,
    });
  } catch (e: any) {
    console.error('[search/resources] error:', e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

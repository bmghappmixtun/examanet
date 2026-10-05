// @ts-nocheck
/**
 * GET /api/preview-series2/[slug]/list
 * Returns EXERCISE resources (Série d'exercices) for the v2 apex design page.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

const SORT_QUERIES: Record<string, string> = {
  recent: 'r.publishedAt DESC',
  popular: 'r.viewsCount DESC',
  downloads: 'r.downloadsCount DESC',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug: subjectSlug } = await params;
    const sp = request.nextUrl.searchParams;
    const classSlug = sp.get('class');
    const trimestreParam = sp.get('trimestre');
    const sortParam = sp.get('sort') || 'recent';
    const cursor = Math.max(0, parseInt(sp.get('cursor') || '0', 10));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(sp.get('limit') || String(DEFAULT_LIMIT), 10)));

    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (!db) return NextResponse.json({ error: 'DB not available', items: [], total: 0 }, { status: 503 });

    const subject = await db
      .prepare('SELECT id, slug, nameFr FROM "Subject" WHERE slug = ?')
      .bind(subjectSlug)
      .first();
    if (!subject) return NextResponse.json({ error: 'Subject not found', items: [], total: 0 }, { status: 404 });

    const conditions = ["r.status = 'PUBLISHED'", "r.type = 'EXERCISE'", 'r.subjectId = ?'];
    const params_arr: any[] = [subject.id];

    if (classSlug) {
      const classRow = await db.prepare('SELECT id FROM "Class" WHERE slug = ?').bind(classSlug).first();
      if (!classRow) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      conditions.push('r.classId = ?');
      params_arr.push(classRow.id);
    }

    if (trimestreParam && ['1', '2', '3'].includes(trimestreParam)) {
      conditions.push("r.`trimester` = ?");
      params_arr.push(trimestreParam);
    }

    const whereClause = conditions.join(' AND ');

    const totalRes = await db
      .prepare(`SELECT COUNT(*) as total FROM Resource r WHERE ${whereClause}`)
      .bind(...params_arr)
      .first();
    const total = Number(totalRes?.total || 0);

    const orderBy = SORT_QUERIES[sortParam] || SORT_QUERIES.recent;

    const itemsRes = await db
      .prepare(
        [
          'SELECT r.id, r.numericId, r.slug, r.title, r.type, r.summary,',
          'r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount,',
          'r.hasCorrection, r.year, r.thumbnailUrl, r.thumbnailKey,',
          'r.pageCount, r.fileSize, r.language, r.publishedAt,',
          'r.`trimester`,',
          's.slug as s_slug, s.nameFr as s_nameFr, s.color as s_color,',
          'c.slug as c_slug, c.nameFr as c_nameFr,',
          't.firstName as t_firstName, t.lastName as t_lastName',
          'FROM Resource r',
          'LEFT JOIN `Subject` s ON r.subjectId = s.id',
          'LEFT JOIN `Class` c ON r.classId = c.id',
          'LEFT JOIN `User` t ON r.teacherId = t.id',
          `WHERE ${whereClause}`,
          `ORDER BY ${orderBy}`,
          'LIMIT ? OFFSET ?',
        ].join('\n'),
      )
      .bind(...params_arr, limit, cursor)
      .all();

    const items = (itemsRes.results || []).map((r: any) => ({
      id: r.id,
      numericId: r.numericId,
      slug: r.slug,
      title: r.title,
      type: r.type,
      summary: r.summary,
      viewsCount: r.viewsCount || 0,
      downloadsCount: r.downloadsCount || 0,
      avgRating: r.avgRating || 0,
      ratingCount: r.ratingsCount || 0,
      hasCorrection: !!r.hasCorrection,
      year: r.year,
      thumbnailUrl: r.thumbnailUrl,
      thumbnailKey: r.thumbnailKey,
      pageCount: r.pageCount,
      fileSize: r.fileSize,
      language: r.language,
      publishedAt: r.publishedAt,
      trimester: r.trimester,
      homeworkSubtype: null,
      homeworkNumber: null,
      commentsCount: 0,
      favoritesCount: 0,
      isFavorited: false,
      subject: r.s_slug ? { slug: r.s_slug, nameFr: r.s_nameFr, color: r.s_color } : null,
      class: r.c_slug ? { slug: r.c_slug, nameFr: r.c_nameFr } : null,
      teacher: r.t_firstName ? { firstName: r.t_firstName, lastName: r.lastName } : null,
    }));

    const nextCursor = cursor + items.length < total ? cursor + items.length : null;

    return NextResponse.json(
      { items, total, nextCursor },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
    );
  } catch (e: any) {
    console.error('[api/preview-series2/list] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

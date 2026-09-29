// @ts-nocheck
/**
 * GET /api/devoirs/[slug]
 *
 * Returns paginated devoir (DEVOIR type) resources for a subject,
 * with optional filters: class, trimestre, subtype, number.
 *
 * Query params:
 *   - class:    optional class slug (e.g. "7eme", "2eme-secondaire")
 *   - trimestre: optional "1" | "2" | "3"
 *   - subtype:  optional "CONTROLE" | "SYNTHESE" | "MAISON" | "REVISION"
 *               (normalized: also matches CONTROL/SYNTHESIS variants in DB)
 *   - number:   optional integer (homeworkNumber)
 *   - cursor:   numeric offset for pagination (default 0)
 *   - limit:    page size (default 24, max 48)
 *
 * Response:
 *   { items: ResourceCardData[], total: number, nextCursor: number | null,
 *     filters: { trimestre: 1, subtype: 'CONTROLE', number: 1 } }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug: subjectSlug } = await params;
    const sp = request.nextUrl.searchParams;
    const classSlug = sp.get('class');
    const trimestreParam = sp.get('trimestre');
    const subtypeParam = sp.get('subtype');
    const numberParam = sp.get('number');
    const cursor = Math.max(0, parseInt(sp.get('cursor') || '0', 10));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(sp.get('limit') || String(DEFAULT_LIMIT), 10)));

    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (!db) {
      return NextResponse.json({ error: 'DB not available', items: [], total: 0 }, { status: 503 });
    }

    // Resolve subject
    const subject = await db
      .prepare('SELECT id, slug, nameFr, nameAr, color FROM "Subject" WHERE slug = ?')
      .bind(subjectSlug)
      .first();
    if (!subject) {
      return NextResponse.json({ error: 'Subject not found', items: [], total: 0 }, { status: 404 });
    }

    // Build WHERE clause
    const conditions = ["r.status = 'PUBLISHED'", "r.type = 'DEVOIR'", 'r.subjectId = ?'];
    const params_arr: any[] = [subject.id];

    if (classSlug) {
      const classRow = await db
        .prepare('SELECT id FROM "Class" WHERE slug = ?')
        .bind(classSlug)
        .first();
      if (!classRow) {
        return NextResponse.json({ error: 'Class not found', items: [], total: 0 }, { status: 404 });
      }
      conditions.push('r.classId = ?');
      params_arr.push(classRow.id);
    }

    if (trimestreParam && ['1', '2', '3'].includes(trimestreParam)) {
      // Trimester column is TEXT in D1 (stores '1', '2', '3' as strings)
      conditions.push("r.`trimester` = ?");
      params_arr.push(trimestreParam); // pass string directly
    }

    if (subtypeParam) {
      // Normalize: also match English variants (CONTROL ↔ CONTROLE, SYNTHESIS ↔ SYNTHESE)
      const variants = getSubtypeVariants(subtypeParam);
      if (variants.length > 0) {
        const placeholders = variants.map(() => '?').join(',');
        conditions.push(`r.homeworkSubtype IN (${placeholders})`);
        params_arr.push(...variants);
      }
    }

    if (numberParam) {
      const num = parseInt(numberParam, 10);
      if (!isNaN(num) && num > 0) {
        conditions.push('r.homeworkNumber = ?');
        params_arr.push(num);
      }
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const totalRes = await db
      .prepare(`SELECT COUNT(*) as total FROM Resource r WHERE ${whereClause}`)
      .bind(...params_arr)
      .first();
    const total = Number(totalRes?.total || 0);

    // Paginated items (joined)
    const itemsRes = await db
      .prepare(
        [
          'SELECT r.id, r.numericId, r.slug, r.title, r.type, r.summary,',
          'r.viewsCount, r.downloadsCount, r.avgRating, r.ratingsCount,',
          'r.hasCorrection, r.year, r.thumbnailUrl, r.thumbnailKey,',
          'r.pageCount, r.fileSize, r.language, r.publishedAt,',
          'r.`trimester`, r.homeworkSubtype, r.homeworkNumber,',
          's.slug as s_slug, s.nameFr as s_nameFr, s.color as s_color,',
          'c.slug as c_slug, c.nameFr as c_nameFr,',
          't.firstName as t_firstName, t.lastName as t_lastName',
          'FROM Resource r',
          'LEFT JOIN `Subject` s ON r.subjectId = s.id',
          'LEFT JOIN `Class` c ON r.classId = c.id',
          'LEFT JOIN `User` t ON r.teacherId = t.id',
          `WHERE ${whereClause}`,
          'ORDER BY r.publishedAt DESC',
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
      homeworkSubtype: r.homeworkSubtype,
      homeworkNumber: r.homeworkNumber,
      subject: r.s_slug ? { slug: r.s_slug, nameFr: r.s_nameFr, color: r.s_color } : null,
      class: r.c_slug ? { slug: r.c_slug, nameFr: r.c_nameFr } : null,
      teacher: r.t_firstName ? { firstName: r.t_firstName, lastName: r.t_lastName } : null,
    }));

    const nextCursor = cursor + items.length < total ? cursor + items.length : null;

    return NextResponse.json(
      {
        items,
        total,
        nextCursor,
        subject: { slug: subjectSlug, nameFr: subject.nameFr, color: subject.color },
        filters: {
          class: classSlug,
          trimestre: trimestreParam ? parseInt(trimestreParam, 10) : null,
          subtype: subtypeParam,
          number: numberParam ? parseInt(numberParam, 10) : null,
        },
      },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
    );
  } catch (e: any) {
    console.error('[api/devoirs] error:', e);
    return NextResponse.json({ error: e.message, items: [], total: 0 }, { status: 500 });
  }
}

/**
 * Returns the DB variants for a normalized subtype label.
 * CONTROLE <-> CONTROL, SYNTHESE <-> SYNTHESIS.
 */
function getSubtypeVariants(normalized: string): string[] {
  const map: Record<string, string[]> = {
    CONTROLE: ['CONTROLE', 'CONTROL'],
    SYNTHESE: ['SYNTHESE', 'SYNTHESIS'],
    MAISON: ['MAISON'],
    REVISION: ['REVISION'],
  };
  return map[normalized] || [normalized];
}

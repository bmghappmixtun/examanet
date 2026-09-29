// @ts-nocheck
/**
 * GET /api/devoirs/[slug]/facets
 *
 * Returns counts grouped by (trimestre, subtype, number) for the sidebar filter UI.
 * Filters:
 *   - class: optional class slug
 *
 * Response:
 *   {
 *     total: number,                          // total devoirs matching base criteria
 *     trimestres: {                           // count per trimestre (1, 2, 3) + null
 *       "1": 1234,
 *       "2": 567,
 *       "3": 890,
 *       "null": 1301
 *     },
 *     filters: [                              // list of (trimestre, subtype, number) with counts
 *       { trimestre: 1, subtype: "CONTROLE", number: 1, count: 125 },
 *       { trimestre: 1, subtype: "SYNTHESE", number: 1, count: 117 },
 *       ...
 *     ]
 *   }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug: subjectSlug } = await params;
    const sp = request.nextUrl.searchParams;
    const classSlug = sp.get('class');

    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

    const subject = await db
      .prepare('SELECT id FROM "Subject" WHERE slug = ?')
      .bind(subjectSlug)
      .first();
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

    const conditions = ["r.status = 'PUBLISHED'", "r.type = 'DEVOIR'", 'r.subjectId = ?'];
    const params_arr: any[] = [subject.id];

    if (classSlug) {
      const classRow = await db
        .prepare('SELECT id FROM "Class" WHERE slug = ?')
        .bind(classSlug)
        .first();
      if (!classRow) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      conditions.push('r.classId = ?');
      params_arr.push(classRow.id);
    }

    const whereClause = conditions.join(' AND ');

    // Total
    const totalRes = await db
      .prepare(`SELECT COUNT(*) as total FROM Resource r WHERE ${whereClause}`)
      .bind(...params_arr)
      .first();
    const total = Number(totalRes?.total || 0);

    // Per trimestre count
    const trimestresRes = await db
      .prepare(
        `SELECT \`trimester\`, COUNT(*) as cnt
         FROM Resource r
         WHERE ${whereClause}
         GROUP BY \`trimester\``,
      )
      .bind(...params_arr)
      .all();
    const trimestres: Record<string, number> = {};
    for (const r of (trimestresRes.results || []) as any[]) {
      const key = r.trimester === null ? 'null' : String(r.trimester);
      trimestres[key] = Number(r.cnt);
    }

    // Per (trimestre, subtype, number) breakdown
    const filtersRes = await db
      .prepare(
        `SELECT
           \`trimester\`,
           CASE WHEN homeworkSubtype IN ('CONTROLE','CONTROL') THEN 'CONTROLE'
                WHEN homeworkSubtype IN ('SYNTHESE','SYNTHESIS') THEN 'SYNTHESE'
                ELSE homeworkSubtype END as subtype_norm,
           homeworkNumber,
           COUNT(*) as cnt
         FROM Resource r
         WHERE ${whereClause} AND \`trimester\` IS NOT NULL
         GROUP BY \`trimester\`, subtype_norm, homeworkNumber
         ORDER BY \`trimester\`, subtype_norm, homeworkNumber`,
      )
      .bind(...params_arr)
      .all();

    const filters = (filtersRes.results || []).map((r: any) => ({
      trimestre: Number(r.trimester),
      subtype: r.subtype_norm,
      number: r.homeworkNumber,
      count: Number(r.cnt),
    }));

    return NextResponse.json(
      { total, trimestres, filters },
      { headers: { 'Cache-Control': 'public, max-age=120, s-maxage=120' } },
    );
  } catch (e: any) {
    console.error('[api/devoirs/facets] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

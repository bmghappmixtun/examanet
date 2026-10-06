// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

// Cycle → allowed class slugs (mirrors preview-devoirs2 list route).
const CYCLE_CLASS_SLUGS: Record<string, string[]> = {
  college: ['7eme', '8eme', '9eme'],
  lycee: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug: subjectSlug } = await params;
    const sp = request.nextUrl.searchParams;
    const classSlug = sp.get('class');
    const cycleParam = sp.get('cycle'); // 'college' | 'lycee' | null

    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

    const subject = await db.prepare('SELECT id FROM "Subject" WHERE slug = ?').bind(subjectSlug).first();
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

    const conditions = ["r.status = 'PUBLISHED'", "r.type = 'DEVOIR'", 'r.subjectId = ?'];
    const params_arr: any[] = [subject.id];

    // Resolve cycle classIds (if cycle is set)
    let cycleClassIds: number[] | null = null;
    if (cycleParam && CYCLE_CLASS_SLUGS[cycleParam]) {
      const slugs = CYCLE_CLASS_SLUGS[cycleParam];
      const placeholders = slugs.map(() => '?').join(',');
      const idsRes = await db
        .prepare(`SELECT id FROM "Class" WHERE slug IN (${placeholders})`)
        .bind(...slugs)
        .all();
      cycleClassIds = (idsRes.results || []).map((r: any) => r.id);
      if (cycleClassIds.length === 0) {
        return NextResponse.json({
          total: 0, trimestres: {}, filters: [], subtypes: [], classes: [],
        });
      }
    }

    if (classSlug) {
      const c = await db.prepare('SELECT id FROM "Class" WHERE slug = ?').bind(classSlug).first();
      if (!c) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      conditions.push('r.classId = ?');
      params_arr.push(c.id);
    } else if (cycleClassIds) {
      const placeholders = cycleClassIds.map(() => '?').join(',');
      conditions.push(`r.classId IN (${placeholders})`);
      params_arr.push(...cycleClassIds);
    }

    const whereClause = conditions.join(' AND ');

    const totalRes = await db
      .prepare(`SELECT COUNT(*) as total FROM Resource r WHERE ${whereClause}`)
      .bind(...params_arr)
      .first();
    const total = Number(totalRes?.total || 0);

    const trimestresRes = await db
      .prepare(
        `SELECT \`trimester\`, COUNT(*) as cnt FROM Resource r WHERE ${whereClause} GROUP BY \`trimester\``,
      )
      .bind(...params_arr)
      .all();
    const trimestres: Record<string, number> = {};
    for (const r of (trimestresRes.results || []) as any[]) {
      const key = r.trimester === null ? 'null' : String(r.trimester);
      trimestres[key] = Number(r.cnt);
    }

    // Filters nested per trimestre (for the existing TYPE pill list when T selected)
    // Sanity: homeworkNumber must be 1-20 (anything else = teacher typo, e.g. year)
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
           AND homeworkNumber BETWEEN 1 AND 20
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

    // Subtype-number aggregation ACROSS ALL TRIMESTRES (for the standalone TYPE filter)
    const subtypesRes = await db
      .prepare(
        `SELECT
           CASE WHEN homeworkSubtype IN ('CONTROLE','CONTROL') THEN 'CONTROLE'
                WHEN homeworkSubtype IN ('SYNTHESE','SYNTHESIS') THEN 'SYNTHESE'
                WHEN homeworkSubtype IS NULL THEN NULL
                ELSE homeworkSubtype END as subtype_norm,
           homeworkNumber,
           COUNT(*) as cnt
         FROM Resource r
         WHERE ${whereClause} AND homeworkSubtype IS NOT NULL
           AND homeworkNumber BETWEEN 1 AND 20
         GROUP BY subtype_norm, homeworkNumber
         ORDER BY subtype_norm, homeworkNumber`,
      )
      .bind(...params_arr)
      .all();
    const subtypes = (subtypesRes.results || [])
      .filter((r: any) => r.subtype_norm != null && r.homeworkNumber != null)
      .map((r: any) => ({
        subtype: r.subtype_norm,
        number: r.homeworkNumber,
        count: Number(r.cnt),
      }));

    // If cycle is active, also return the list of classes in that cycle
    // so the page can highlight the active cycle in the filter sidebar.
    let classesPayload: Array<{ slug: string; count: number }> | undefined;
    if (cycleParam && CYCLE_CLASS_SLUGS[cycleParam]) {
      const slugs = CYCLE_CLASS_SLUGS[cycleParam];
      const placeholders = slugs.map(() => '?').join(',');
      const classCountsRes = await db
        .prepare(
          `SELECT c.slug, COUNT(r.id) as cnt
             FROM "Class" c
             LEFT JOIN "Resource" r ON r.classId = c.id
              AND r.type = 'DEVOIR' AND r.subjectId = ? AND r.status = 'PUBLISHED'
             WHERE c.slug IN (${placeholders})
             GROUP BY c.slug
             ORDER BY c.numericId ASC`,
        )
        .bind(subject.id, ...slugs)
        .all();
      classesPayload = (classCountsRes.results || []).map((r: any) => ({
        slug: r.slug,
        count: Number(r.cnt),
      }));
    }

    return NextResponse.json(
      {
        total, trimestres, filters, subtypes,
        ...(classesPayload ? { cycleClasses: classesPayload } : {}),
      },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
    );
  } catch (e: any) {
    console.error('[api/preview-devoirs2/facets] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// @ts-nocheck
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

    const subject = await db.prepare('SELECT id FROM "Subject" WHERE slug = ?').bind(subjectSlug).first();
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

    const conditions = ["r.status = 'PUBLISHED'", "r.type = 'EXERCISE'", 'r.subjectId = ?'];
    const params_arr: any[] = [subject.id];

    if (classSlug) {
      const c = await db.prepare('SELECT id FROM "Class" WHERE slug = ?').bind(classSlug).first();
      if (!c) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      conditions.push('r.classId = ?');
      params_arr.push(c.id);
    }

    const whereClause = conditions.join(' AND ');

    const totalRes = await db
      .prepare(`SELECT COUNT(*) as total FROM Resource r WHERE ${whereClause}`)
      .bind(...params_arr)
      .first();
    const total = Number(totalRes?.total || 0);

    // Trimestre aggregation
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

    // No subtypes aggregation for series
    const filters: any[] = [];
    const subtypes: any[] = [];

    return NextResponse.json(
      { total, trimestres, filters, subtypes },
      { headers: { 'Cache-Control': 'public, max-age=120, s-maxage=120' } },
    );
  } catch (e: any) {
    console.error('[api/preview-series2/facets] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

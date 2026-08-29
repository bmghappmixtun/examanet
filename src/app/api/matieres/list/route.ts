/**
 * GET /api/matieres/list
 *
 * Returns all subjects with their resource counts.
 * Used by the /fr/matieres list page (client-only).
 *
 * Replaces the SSR approach in the page (which crashed on CF Workers
 * because of getCloudflareContext() race condition + D1 .all() issues).
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // 5 min cache

const EXCLUDED_SLUGS = ['sport', 'sciences-informatique-matiere'];

export async function GET() {
  try {
    // Dynamic import to avoid the static-import-stripped-in-build issue
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env?.DB;
    if (!db) {
      return NextResponse.json(
        { error: 'DB not available', subjects: [] },
        { status: 500 }
      );
    }

    // Get all subjects (excluding special ones)
    const subjectsQuery = [
      'SELECT id, slug, nameFr, nameAr, color, "order"',
      'FROM Subject',
      `WHERE slug NOT IN (${EXCLUDED_SLUGS.map(() => '?').join(',')})`,
      'ORDER BY "order" ASC',
    ].join(' ');
    const subjectsResult = await db.prepare(subjectsQuery)
      .bind(...EXCLUDED_SLUGS)
      .all();
    const subjects = subjectsResult.results || subjectsResult || [];

    // Get resource counts in one query
    const countsResult = await db.prepare([
      'SELECT subjectId, COUNT(*) as count',
      'FROM Resource',
      "WHERE status = 'PUBLISHED' AND subjectId IS NOT NULL",
      'GROUP BY subjectId',
    ].join(' ')).all();
    const counts = countsResult.results || countsResult || [];

    const countsMap = new Map<string, number>();
    for (const row of counts as any[]) {
      countsMap.set(row.subjectId, Number(row.count));
    }

    const result = (subjects as any[]).map((s) => ({
      id: s.id,
      slug: s.slug,
      nameFr: s.nameFr,
      nameAr: s.nameAr,
      color: s.color,
      order: s.order,
      resourceCount: countsMap.get(s.id) || 0,
    }));

    const totalResources = result.reduce((sum, s) => sum + s.resourceCount, 0);

    return NextResponse.json({
      subjects: result,
      total: result.length,
      totalResources,
    });
  } catch (err: any) {
    console.error('[api/matieres/list] error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error', subjects: [] },
      { status: 500 }
    );
  }
}

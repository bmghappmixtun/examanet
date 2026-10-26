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

    // 2026-10-26 : comptes par TYPE et par CYCLE, pour que le méga-menu
    // puisse (a) masquer les liens qui mènent à une page vide et (b) afficher
    // le nombre attendu à côté de chaque lien.
    //
    // Constat : le menu génère 4 liens par matière (matieres + devoirs +
    // series + cours) SANS regarder le contenu réel → 34 des 141 liens
    // (24 %) mènent à une page vide (« 0 ressource »). Exemple : le
    // collège n'a AUCUN cours d'anglais, mais le menu proposait
    // « Cours Anglais » côté collège.
    const byTypeQuery = [
      'SELECT subjectId, type,',
      '  SUM(CASE WHEN c.slug IN (\'7eme\',\'8eme\',\'9eme\') THEN 1 ELSE 0 END) as college,',
      '  SUM(CASE WHEN c.slug IN (\'1ere-secondaire\',\'2eme-secondaire\',\'3eme-secondaire\',\'4eme-secondaire\') THEN 1 ELSE 0 END) as lycee',
      'FROM Resource r',
      'LEFT JOIN "Class" c ON c.id = r.classId',
      "WHERE r.status = 'PUBLISHED' AND r.subjectId IS NOT NULL",
      "  AND r.type IN ('DEVOIR','EXERCISE','COURSE')",
      'GROUP BY subjectId, type',
    ].join(' ');
    const byTypeResult = await db.prepare(byTypeQuery).all();
    const byTypeRows = byTypeResult.results || byTypeResult || [];

    // Total par cycle, TOUS types confondus (le lien « /matieres/{slug} »
    // n'est pas filtré par type) → sert à afficher le bon total sur le
    // lien principal de la matière.
    const totalByCycleQuery = [
      'SELECT subjectId,',
      '  SUM(CASE WHEN c.slug IN (\'7eme\',\'8eme\',\'9eme\') THEN 1 ELSE 0 END) as college,',
      '  SUM(CASE WHEN c.slug IN (\'1ere-secondaire\',\'2eme-secondaire\',\'3eme-secondaire\',\'4eme-secondaire\') THEN 1 ELSE 0 END) as lycee',
      'FROM Resource r',
      'LEFT JOIN "Class" c ON c.id = r.classId',
      "WHERE r.status = 'PUBLISHED' AND r.subjectId IS NOT NULL",
      'GROUP BY subjectId',
    ].join(' ');
    const totalByCycleResult = await db.prepare(totalByCycleQuery).all();
    const totalByCycleRows = totalByCycleResult.results || totalByCycleResult || [];
    const totalByCycleMap = new Map<string, CycleCounts>();
    for (const row of totalByCycleRows as any[]) {
      totalByCycleMap.set(row.subjectId, {
        college: Number(row.college || 0),
        lycee: Number(row.lycee || 0),
      });
    }

    type CycleCounts = { college: number; lycee: number };
    const typeMap = new Map<string, Map<string, CycleCounts>>();
    for (const row of byTypeRows as any[]) {
      const subjectId = row.subjectId;
      if (!typeMap.has(subjectId)) typeMap.set(subjectId, new Map());
      typeMap.get(subjectId)!.set(row.type, {
        college: Number(row.college || 0),
        lycee: Number(row.lycee || 0),
      });
    }

    const result = (subjects as any[]).map((s) => ({
      id: s.id,
      slug: s.slug,
      nameFr: s.nameFr,
      nameAr: s.nameAr,
      color: s.color,
      order: s.order,
      resourceCount: countsMap.get(s.id) || 0,
      // 2026-10-26 : détail par type et par cycle (pour le méga-menu).
      counts: Object.fromEntries(
        (typeMap.get(s.id) ?? new Map()).entries()
      ) as Record<string, CycleCounts>,
      totalByCycle: totalByCycleMap.get(s.id) ?? { college: 0, lycee: 0 },
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

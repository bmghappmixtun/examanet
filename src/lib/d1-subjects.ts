// @ts-nocheck
// D1-based helper functions for subject-related queries.
// Replaces prisma-compat calls on CF Workers (avoids getCloudflareContext race).

export interface SubjectRow {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string | null;
  color: string | null;
  icon: string | null;
  order: number;
}

export async function getD1(): Promise<any> {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function getAllSubjects(db: any, excludeSlugs: string[] = []): Promise<SubjectRow[]> {
  const excludeClause = excludeSlugs.length > 0 
    ? `WHERE slug NOT IN (${excludeSlugs.map(() => '?').join(',')})`
    : '';
  const result = await db.prepare(`
    SELECT id, slug, nameFr, nameAr, color, icon, "order"
    FROM Subject
    ${excludeClause}
    ORDER BY "order" ASC
  `).bind(...excludeSlugs).all();
  return result.results || [];
}

export async function getSubjectBySlug(db: any, slug: string): Promise<SubjectRow | null> {
  const result = await db.prepare(`
    SELECT id, slug, nameFr, nameAr, color, icon, "order"
    FROM Subject
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first();
  return result;
}

export async function getAllSubjectSlugs(db: any): Promise<string[]> {
  const result = await db.prepare(`
    SELECT slug FROM Subject
  `).all();
  return (result.results || []).map((s: any) => s.slug);
}

export async function getResourceCountBySubject(db: any, subjectId: string): Promise<number> {
  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM Resource
    WHERE subjectId = ? AND status = 'PUBLISHED'
  `).bind(subjectId).first();
  return result?.count || 0;
}

export async function getResourceCountsAllSubjects(db: any): Promise<Map<string, number>> {
  const result = await db.prepare(`
    SELECT subjectId, COUNT(*) as count
    FROM Resource
    WHERE status = 'PUBLISHED' AND subjectId IS NOT NULL
    GROUP BY subjectId
  `).all();
  const map = new Map<string, number>();
  for (const row of result.results || []) {
    map.set(row.subjectId, row.count);
  }
  return map;
}

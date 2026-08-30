// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import CatalogAdminClient from '@/components/admin/CatalogAdminClient';

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export default async function AdminCatalogPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  const db = await getD1();

  // Fetch counts in parallel: subjects, levels, classes, sections + their resource counts
  const [subjectsR, levelsR, classesR, sectionsR] = await Promise.all([
    db
      .prepare(
        `SELECT s.id, s.numericId, s.slug, s.nameFr, s.nameAr, s.icon, s.color, s."order",
                (SELECT COUNT(*) FROM Resource r WHERE r.subjectId = s.id) AS resourceCount
         FROM Subject s
         ORDER BY s.nameFr ASC`,
      )
      .all()
      .catch(() => ({ results: [] })),
    db
      .prepare(
        `SELECT l.id, l.numericId, l.slug, l.nameFr, l.nameAr, l."order",
                (SELECT COUNT(*) FROM "Class" c WHERE c.levelId = l.id) AS classCount
         FROM "Level" l
         ORDER BY l."order" ASC`,
      )
      .all()
      .catch(() => ({ results: [] })),
    db
      .prepare(
        `SELECT c.id, c.numericId, c.slug, c.nameFr, c.nameAr, c."order", c.levelId,
                l.nameFr AS levelNameFr, l.slug AS levelSlug,
                (SELECT COUNT(*) FROM Resource r WHERE r.classId = c.id) AS resourceCount,
                (SELECT COUNT(*) FROM Section sec WHERE sec.id IN (SELECT sectionId FROM Resource r WHERE r.classId = c.id)) AS sectionCount
         FROM "Class" c
         LEFT JOIN "Level" l ON c.levelId = l.id
         ORDER BY l."order" ASC, c."order" ASC`,
      )
      .all()
      .catch(() => ({ results: [] })),
    db
      .prepare(
        `SELECT s.id, s.numericId, s.slug, s.nameFr, s.nameAr, s."order",
                (SELECT COUNT(*) FROM Resource r WHERE r.sectionId = s.id) AS resourceCount
         FROM Section s
         ORDER BY s.nameFr ASC`,
      )
      .all()
      .catch(() => ({ results: [] })),
  ]);

  // Map to expected shape with _count
  const subjects = (subjectsR?.results || []).map((s: any) => ({
    ...s,
    _count: { resources: s.resourceCount || 0 },
  }));
  const levels = (levelsR?.results || []).map((l: any) => ({
    ...l,
    _count: { classes: l.classCount || 0 },
  }));
  const classes = (classesR?.results || []).map((c: any) => ({
    ...c,
    level: { nameFr: c.levelNameFr, slug: c.levelSlug },
    _count: { resources: c.resourceCount || 0, sections: c.sectionCount || 0 },
  }));
  const sections = (sectionsR?.results || []).map((s: any) => ({
    ...s,
    _count: { resources: s.resourceCount || 0 },
  }));

  return (
    <CatalogAdminClient
      initialData={{
        subjects,
        levels,
        classes,
        sections,
      }}
    />
  );
}

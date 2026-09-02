// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import CatalogAdminClient from '@/components/admin/CatalogAdminClient';
import AdminCatalogIndex from '@/components/admin/AdminCatalogIndex';
import { cachedD1Query } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Catalogue — Examanet Admin',
};

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

  // PERF 2026-09-02: Cache the 4 lookup queries (5min TTL)
  // These counts change infrequently (admin actions only).
  // 5min is safe for admin pages — admins tolerate the lag.
  const [subjectsR, levelsR, classesR, sectionsR] = await Promise.all([
    cachedD1Query({
      key: 'catalog-subjects-v1',
      ttl: 300,
      query: () =>
        db
          .prepare(
            `SELECT s.id, s.numericId, s.slug, s.nameFr, s.nameAr, s.icon, s.color, s."order",
                    (SELECT COUNT(*) FROM Resource r WHERE r.subjectId = s.id) AS resourceCount
             FROM Subject s
             ORDER BY s.nameFr ASC`,
          )
          .all()
          .catch(() => ({ results: [] })),
    }),
    cachedD1Query({
      key: 'catalog-levels-v1',
      ttl: 300,
      query: () =>
        db
          .prepare(
            `SELECT l.id, l.numericId, l.slug, l.nameFr, l.nameAr, l."order",
                    (SELECT COUNT(*) FROM "Class" c WHERE c.levelId = l.id) AS classCount
             FROM "Level" l
             ORDER BY l."order" ASC`,
          )
          .all()
          .catch(() => ({ results: [] })),
    }),
    cachedD1Query({
      key: 'catalog-classes-v1',
      ttl: 300,
      query: () =>
        db
          .prepare(
            `SELECT c.id, c.numericId, c.slug, c.nameFr, c.nameAr, c."order", c.levelId,
                    l.nameFr AS levelNameFr, l.slug AS levelSlug,
                    (SELECT COUNT(*) FROM Resource r WHERE r.classId = c.id) AS resourceCount,
                    (SELECT COUNT(*) FROM Section sec WHERE sec.id IN (SELECT DISTINCT sectionId FROM Resource r WHERE r.classId = c.id AND r.sectionId IS NOT NULL)) AS sectionCount
             FROM "Class" c
             LEFT JOIN "Level" l ON c.levelId = l.id
             ORDER BY l."order" ASC, c."order" ASC`,
          )
          .all()
          .catch(() => ({ results: [] })),
    }),
    cachedD1Query({
      key: 'catalog-sections-v1',
      ttl: 300,
      query: () =>
        db
          .prepare(
            `SELECT s.id, s.numericId, s.slug, s.nameFr, s.nameAr, s."order",
                    (SELECT COUNT(*) FROM Resource r WHERE r.sectionId = s.id) AS resourceCount
             FROM Section s
             ORDER BY s.nameFr ASC`,
          )
          .all()
          .catch(() => ({ results: [] })),
    }),
  ]);

  const subjects = (subjectsR?.results || []).map((s: any) => ({ ...s, _count: { resources: s.resourceCount || 0 } }));
  const levels = (levelsR?.results || []).map((l: any) => ({ ...l, _count: { classes: l.classCount || 0 } }));
  const classes = (classesR?.results || []).map((c: any) => ({
    ...c,
    level: { nameFr: c.levelNameFr, slug: c.levelSlug },
    _count: { resources: c.resourceCount || 0, sections: c.sectionCount || 0 },
  }));
  const sections = (sectionsR?.results || []).map((s: any) => ({ ...s, _count: { resources: s.resourceCount || 0 } }));

  return (
    <>
      <AdminCatalogIndex
        stats={{
          subjects: subjects.length,
          levels: levels.length,
          classes: classes.length,
          sections: sections.length,
        }}
      />
      <CatalogAdminClient
        initialData={{ subjects, levels, classes, sections }}
      />
    </>
  );
}

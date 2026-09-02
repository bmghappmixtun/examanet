// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1All } from '@/lib/db-d1';

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const [subjects, classes, sections] = await Promise.all([
    d1All(
      'SELECT id, nameFr, nameAr, slug, icon, color FROM Subject ORDER BY nameFr ASC',
    ),
    d1All(
      `SELECT c.id, c.nameFr, c.nameAr, c.slug, c.levelId,
              l.nameFr AS levelNameFr, l.slug AS levelSlug
       FROM "Class" c
       LEFT JOIN "Level" l ON c.levelId = l.id
       ORDER BY l."order" ASC, c."order" ASC`,
    ),
    d1All('SELECT id, nameFr, nameAr, slug, classId FROM Section'),
  ]);

  // Normalize classes to include nested level
  const normalizedClasses = (classes || []).map((c: any) => ({
    id: c.id,
    nameFr: c.nameFr,
    nameAr: c.nameAr,
    slug: c.slug,
    levelId: c.levelId,
    level: c.levelNameFr
      ? { nameFr: c.levelNameFr, slug: c.levelSlug }
      : null,
  }));

  return NextResponse.json({
    subjects: subjects || [],
    classes: normalizedClasses,
    sections: sections || [],
  });
}

// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run, genId } from '@/lib/db-d1';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const classes = await d1All(
    `SELECT c.id, c.numericId, c.slug, c.nameFr, c.nameAr, c."order", c.levelId,
            l.nameFr AS levelNameFr, l.slug AS levelSlug,
            (SELECT COUNT(*) FROM Resource r WHERE r.classId = c.id) AS resourceCount,
            (SELECT COUNT(DISTINCT sectionId) FROM Resource r WHERE r.classId = c.id AND r.sectionId IS NOT NULL) AS sectionCount
     FROM "Class" c LEFT JOIN "Level" l ON c.levelId = l.id
     ORDER BY l."order" ASC, c."order" ASC`,
  );
  return NextResponse.json({ classes });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { slug, nameFr, nameAr, levelId, order } = body;
    if (!slug || !nameFr || !nameAr || !levelId) {
      return NextResponse.json({ error: 'slug, nameFr, nameAr, levelId requis' }, { status: 400 });
    }
    const slugClean = slug.toLowerCase().trim();
    const existing = await d1First('SELECT id FROM "Class" WHERE slug = ?', slugClean);
    if (existing) return NextResponse.json({ error: 'Ce slug existe déjà' }, { status: 400 });
    const id = genId();
    const now = Date.now();
    const r = await d1Run(
      `INSERT INTO "Class" (id, slug, nameFr, nameAr, levelId, "order", createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, slugClean, nameFr.trim(), nameAr.trim(), levelId,
      typeof order === 'number' ? order : 0, now, now,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

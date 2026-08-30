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
  const levels = await d1All(
    `SELECT l.id, l.numericId, l.slug, l.nameFr, l.nameAr, l.schoolType, l."order",
            (SELECT COUNT(*) FROM "Class" c WHERE c.levelId = l.id) AS classCount
     FROM "Level" l ORDER BY l."order" ASC`,
  );
  return NextResponse.json({ levels });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { slug, nameFr, nameAr, schoolType, order } = body;
    if (!slug || !nameFr || !nameAr) {
      return NextResponse.json({ error: 'slug, nameFr, nameAr requis' }, { status: 400 });
    }
    const slugClean = slug.toLowerCase().trim();
    const existing = await d1First('SELECT id FROM "Level" WHERE slug = ?', slugClean);
    if (existing) return NextResponse.json({ error: 'Ce slug existe déjà' }, { status: 400 });
    const id = genId();
    const now = Date.now();
    const r = await d1Run(
      `INSERT INTO "Level" (id, slug, nameFr, nameAr, schoolType, "order", createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, slugClean, nameFr.trim(), nameAr.trim(), schoolType || 'PUBLIC',
      typeof order === 'number' ? order : 0, now, now,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

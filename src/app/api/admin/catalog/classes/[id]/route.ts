// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json();
    const fields: string[] = [];
    const values: any[] = [];
    for (const k of ['nameFr', 'nameAr', 'levelId', 'order']) {
      if (body[k] !== undefined) {
        fields.push(`${k} = ?`);
        values.push(body[k]);
      }
    }
    if (fields.length === 0) return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
    fields.push('updatedAt = ?');
    values.push(Date.now());
    values.push(id);
    const r = await d1Run(`UPDATE "Class" SET ${fields.join(', ')} WHERE id = ?`, ...values);
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const used = await d1First('SELECT COUNT(*) as c FROM Resource WHERE classId = ?', id);
    if (used && Number(used.c) > 0) {
      return NextResponse.json(
        { error: `Impossible : ${used.c} ressource(s) utilisent cette classe` },
        { status: 400 },
      );
    }
    const r = await d1Run('DELETE FROM "Class" WHERE id = ?', id);
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

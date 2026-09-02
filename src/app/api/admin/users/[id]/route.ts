// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const { id } = await params;
  const u = await d1First(
    `SELECT id, email, firstName, lastName, role, status, isVerifiedTeacher,
            schoolName, governorate, diploma, avatarUrl, bio, phone, website,
            teachingSubjects, teachingLevels, createdAt, lastLoginAt, slug, numericId
     FROM User WHERE id = ?`,
    id,
  );
  if (!u) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
  return NextResponse.json({ user: u });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const { id } = await params;
  const target = await d1First('SELECT id, role FROM User WHERE id = ?', id);
  if (!target) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

  try {
    const body = await req.json();
    const allowed = [
      'firstName', 'lastName', 'email', 'bio', 'schoolName', 'governorate',
      'diploma', 'avatarUrl', 'phone', 'website', 'isVerifiedTeacher',
      'role', 'status', 'teachingSubjects', 'teachingLevels',
    ];
    const fields: string[] = [];
    const values: any[] = [];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        fields.push(`${k} = ?`);
        let v = body[k];
        if (k === 'isVerifiedTeacher') v = v ? 1 : 0;
        if ((k === 'teachingSubjects' || k === 'teachingLevels') && Array.isArray(v)) v = JSON.stringify(v);
        values.push(v);
      }
    }
    if (fields.length === 0) return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
    fields.push('updatedAt = ?');
    values.push(Date.now());
    values.push(id);
    const r = await d1Run(`UPDATE User SET ${fields.join(', ')} WHERE id = ?`, ...values);
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

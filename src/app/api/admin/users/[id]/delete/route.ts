// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';
import { invalidateCache } from '@/lib/kv-cache';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const { id } = await params;
  const target = await d1First('SELECT id, role, email FROM User WHERE id = ?', id);
  if (!target) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
  if (target.role === 'ADMIN') {
    return NextResponse.json({ error: 'Impossible de supprimer un administrateur' }, { status: 403 });
  }
  if (target.id === me.id) {
    return NextResponse.json({ error: 'Vous ne pouvez pas vous supprimer vous-même' }, { status: 403 });
  }
  // Cascade: delete user's data then user
  await d1Run('DELETE FROM Session WHERE userId = ?', id);
  await d1Run('DELETE FROM TeacherFile WHERE teacherId = ?', id);
  await d1Run('DELETE FROM TeacherVerificationFile WHERE userId = ?', id);
  await d1Run('DELETE FROM Resource WHERE teacherId = ?', id);
  const r = await d1Run('DELETE FROM User WHERE id = ?', id);
  if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
  // PERF 2026-09-02: bust user-count-* caches (count changed)
  await invalidateCache(['user-count-teacher-v1', 'user-count-student-v1', 'user-count-admin-v1']);
  return NextResponse.json({ success: true });
}

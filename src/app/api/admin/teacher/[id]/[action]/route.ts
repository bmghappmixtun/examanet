// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';
import { invalidateCache } from '@/lib/kv-cache';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const { id, action } = await params;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  }
  const teacher = await d1First('SELECT id, role, status FROM User WHERE id = ?', id);
  if (!teacher || teacher.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Enseignant non trouvé' }, { status: 404 });
  }
  let body: { reason?: string } = {};
  try { body = await req.json(); } catch {}
  if (action === 'approve') {
    const r = await d1Run(
      "UPDATE User SET status = 'ACTIVE', isVerifiedTeacher = 1, approvedAt = ?, approvedById = ?, updatedAt = ? WHERE id = ?",
      Date.now(), user.id, Date.now(), id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    // PERF 2026-09-02: bust the user-count-* caches (counts changed)
    await invalidateCache('user-counts-v1');
    // TODO: send approval email (worker can't, so client should hit /api/email/...)
    return NextResponse.json({ success: true, status: 'ACTIVE' });
  } else {
    // reject
    const r = await d1Run(
      "UPDATE User SET status = 'REJECTED', updatedAt = ? WHERE id = ?",
      Date.now(), id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    await invalidateCache('user-counts-v1');
    return NextResponse.json({ success: true, status: 'REJECTED' });
  }
}

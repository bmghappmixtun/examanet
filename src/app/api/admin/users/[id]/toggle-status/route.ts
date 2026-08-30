// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const { id } = await params;
  const target = await d1First('SELECT id, role, status FROM User WHERE id = ?', id);
  if (!target) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
  if (target.role === 'ADMIN') {
    return NextResponse.json({ error: 'Action impossible sur un administrateur' }, { status: 403 });
  }
  if (target.id === me.id) {
    return NextResponse.json({ error: 'Vous ne pouvez pas vous modifier vous-même' }, { status: 403 });
  }
  const newStatus = target.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
  const r = await d1Run('UPDATE User SET status = ?, updatedAt = ? WHERE id = ?', newStatus, Date.now(), id);
  if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ success: true, status: newStatus });
}

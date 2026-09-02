// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { d1First, d1Run } from '@/lib/db-d1';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  try {
    const me = await getCurrentUser();
    if (!me || me.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    const target = await d1First(
      'SELECT id, email, role, status, lockedUntil, failedLoginCount FROM User WHERE id = ?',
      id,
    );
    if (!target) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }
    if (target.role === 'ADMIN' && target.id !== me.id) {
      return NextResponse.json({ error: 'Action impossible sur un autre administrateur' }, { status: 403 });
    }
    const r = await d1Run(
      'UPDATE User SET failedLoginCount = 0, lockedUntil = NULL, lastFailedLoginAt = NULL WHERE id = ?',
      id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ success: true, user: { id: target.id, email: target.email, status: target.status } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

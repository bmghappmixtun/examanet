// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(_req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  try {
    const { id } = await params;
    const inv = await d1First('SELECT id, status FROM TeacherInvitation WHERE id = ?', id);
    if (!inv) return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });
    if (inv.status === 'ACCEPTED') {
      return NextResponse.json({ error: 'Cette invitation a déjà été acceptée' }, { status: 400 });
    }
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000;
    const r = await d1Run(
      'UPDATE TeacherInvitation SET status = ?, expiresAt = ?, invitationSentAt = ? WHERE id = ?',
      'PENDING', expiresAt, now, id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getD1() {
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB || null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Réservé admin' }, { status: 403 });

  const { id } = await params;
  const db = await getD1();
  if (!db) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  try {
    const now = Date.now();
    const result: any = await db
      .prepare(
        `UPDATE Report
         SET status = 'RESOLVED', reviewedById = ?, reviewedAt = ?
         WHERE id = ? AND status = 'PENDING'`,
      )
      .bind(user.id, now, id)
      .run();

    if (!result?.meta?.changes) {
      return NextResponse.json({ error: 'Signalement introuvable ou déjà traité' }, { status: 404 });
    }
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    console.error('[reports resolve] error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

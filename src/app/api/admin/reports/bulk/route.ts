// @ts-nocheck
// POST /api/admin/reports/bulk
// body: { action: 'resolve' | 'delete', ids: string[] }
// Returns: { success: true, affected: number }
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getD1() {
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB || null;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Réservé admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').toLowerCase();
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];

  if (!['resolve', 'delete'].includes(action)) {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Aucun signalement sélectionné' }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 signalements par opération' }, { status: 400 });
  }

  const db = await getD1();
  if (!db) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  try {
    const placeholders = ids.map(() => '?').join(', ');
    const now = Date.now();

    let sql: string;
    let bindings: any[];
    if (action === 'resolve') {
      sql = `UPDATE Report SET status = 'RESOLVED', reviewedById = ?, reviewedAt = ?
             WHERE id IN (${placeholders}) AND status = 'PENDING'`;
      bindings = [user.id, now, ...ids];
    } else {
      sql = `DELETE FROM Report WHERE id IN (${placeholders})`;
      bindings = [...ids];
    }

    const result: any = await db.prepare(sql).bind(...bindings).run();
    return NextResponse.json({
      success: true,
      action,
      affected: result?.meta?.changes || 0,
      requested: ids.length,
    });
  } catch (e: any) {
    console.error('[reports bulk] error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

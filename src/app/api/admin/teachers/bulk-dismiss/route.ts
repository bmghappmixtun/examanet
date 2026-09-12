// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';
import { invalidateCache } from '@/lib/kv-cache';

/**
 * POST /api/admin/teachers/bulk-dismiss — Soft dismiss (NO delete)
 *
 * Marks teachers as dismissed (isDismissed=1) so they no longer appear in
 * /admin/approbations or /admin/verifications lists. The User rows stay intact
 * (no hard delete). They can be un-dismissed later by setting isDismissed=0.
 *
 * SAFETY:
 * - Admin cannot dismiss themselves
 * - Admin role is always preserved
 * - boutiti.mehdi@gmail.com is NEVER dismissed (hard-coded protection)
 *
 * Body: { ids: string[] }
 * Response: { ok: true, dismissed: number }
 */
const PROTECTED_EMAILS = new Set([
  'boutiti.mehdi@gmail.com', // ⚠️ ADMIN — never dismiss
]);

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Aucun utilisateur fourni' }, { status: 400 });
    }
    if (ids.includes(admin.id)) {
      return NextResponse.json({ error: 'Vous ne pouvez pas vous dismisser vous-même' }, { status: 403 });
    }

    // 2026-09-12: Chunk to avoid SQLite "too many SQL variables" errors with large batches.
    // SQLite default limit is 999 parameters; we cap at 50 ids per chunk for safety.
    const CHUNK_SIZE = 50;
    let totalDismissed = 0;
    const protectedEmails = Array.from(PROTECTED_EMAILS);
    const protectedPlaceholders = protectedEmails.map(() => '?').join(',');
    const now = Date.now();

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const idPlaceholders = chunk.map(() => '?').join(',');
      const params: any[] = [now, ...chunk, ...protectedEmails];
      const r = await d1Run(
        `UPDATE User
         SET isDismissed = 1, updatedAt = ?
         WHERE id IN (${idPlaceholders})
           AND role != 'ADMIN'
           AND email NOT IN (${protectedPlaceholders})`,
        ...params,
      );
      totalDismissed += Number((r.meta as any)?.changes || 0);
    }

    try { await invalidateCache('user-counts-v1'); } catch {}

    return NextResponse.json({
      ok: true,
      dismissed: totalDismissed,
    });
  } catch (e: any) {
    console.error('[bulk-dismiss] error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

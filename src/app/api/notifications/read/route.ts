// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { getCurrentUser } from '@/lib/auth';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

/**
 * DELETE /api/notifications/read
 *
 * Delete ALL read notifications for the current user.
 * Useful for "Supprimer les lues" button.
 * Admin users can also pass ?all=1 to delete every notification.
 */
export async function DELETE(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const db = await getD1();
  const deleteAll = req.nextUrl.searchParams.get('all') === '1' && user.role === 'ADMIN';

  const sql = deleteAll
    ? 'DELETE FROM Notification'
    : 'DELETE FROM Notification WHERE userId = ? AND isRead = 1';

  const result = deleteAll
    ? await db.prepare(sql).run()
    : await db.prepare(sql).bind(user.id).run();

  if (!result.success) {
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deleted: result.meta?.changes ?? 0,
  });
}

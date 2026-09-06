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
 * PATCH /api/notifications/[id]
 * Mark a single notification as read. Users can only update their OWN.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isProduction() && !isValidOrigin(_req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'ID requis' }, { status: 400 });
  }

  const db = await getD1();
  const result = await db
    .prepare('UPDATE Notification SET isRead = 1 WHERE id = ? AND userId = ?')
    .bind(id, user.id)
    .run();

  if (!result.success) {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/notifications/[id]
 * Delete a single notification. Users can only delete their OWN.
 * Admin can delete any.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isProduction() && !isValidOrigin(_req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'ID requis' }, { status: 400 });
  }

  const db = await getD1();
  const result = user.role === 'ADMIN'
    ? await db.prepare('DELETE FROM Notification WHERE id = ?').bind(id).run()
    : await db.prepare('DELETE FROM Notification WHERE id = ? AND userId = ?').bind(id, user.id).run();

  if (!result.success) {
    return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 });
  }

  const changes = result.meta?.changes ?? 0;
  if (changes === 0) {
    return NextResponse.json({ error: 'Notification introuvable' }, { status: 404 });
  }

  return NextResponse.json({ success: true, deleted: changes });
}

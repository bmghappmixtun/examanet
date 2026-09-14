// @ts-nocheck
// 2026-09-14: Migrated from Prisma (Neon dead) to D1 (SQLite).
// Prisma endpoint was writing to a disconnected Neon DB — all new favorites
// were lost and Resource.favoritesCount never updated.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/lib/auth';

async function getD1() {
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { resourceId } = await params;

  try {
    const db = await getD1();

    // Check existing favorite
    const existing: any = await db
      .prepare('SELECT id FROM Favorite WHERE userId = ? AND resourceId = ? LIMIT 1')
      .bind(user.id, resourceId)
      .first();

    if (existing) {
      // Remove favorite
      await db.prepare('DELETE FROM Favorite WHERE id = ?').bind(existing.id).run();
      await db
        .prepare(
          'UPDATE Resource SET favoritesCount = MAX(0, favoritesCount - 1) WHERE id = ?',
        )
        .bind(resourceId)
        .run()
        .catch(() => {});
      return NextResponse.json({ favorited: false });
    }

    // Add favorite
    await db
      .prepare(
        'INSERT INTO Favorite (id, resourceId, userId, createdAt) VALUES (?, ?, ?, ?)',
      )
      .bind(crypto.randomUUID(), resourceId, user.id, Date.now())
      .run();
    await db
      .prepare('UPDATE Resource SET favoritesCount = favoritesCount + 1 WHERE id = ?')
      .bind(resourceId)
      .run()
      .catch(() => {});
    return NextResponse.json({ favorited: true });
  } catch (e: any) {
    console.error('[favorites POST] error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  // Convenience DELETE handler (some clients use POST/DELETE toggle)
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { resourceId } = await params;

  try {
    const db = await getD1();
    const r: any = await db
      .prepare('DELETE FROM Favorite WHERE userId = ? AND resourceId = ?')
      .bind(user.id, resourceId)
      .run();
    if (r?.meta?.changes > 0) {
      await db
        .prepare(
          'UPDATE Resource SET favoritesCount = MAX(0, favoritesCount - 1) WHERE id = ?',
        )
        .bind(resourceId)
        .run()
        .catch(() => {});
    }
    return NextResponse.json({ favorited: false, removed: r?.meta?.changes || 0 });
  } catch (e: any) {
    console.error('[favorites DELETE] error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

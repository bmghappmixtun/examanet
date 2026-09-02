// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { resourceId } = await params;
    const db = await getD1();
    if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

    // Check if already favorited
    const existing: any = await db.prepare(
      'SELECT id FROM Favorite WHERE userId = ? AND resourceId = ? LIMIT 1'
    ).bind(user.id, resourceId).first();

    if (existing) {
      // Remove favorite
      await db.prepare('DELETE FROM Favorite WHERE id = ?').bind(existing.id).run();
      await db.prepare(
        "UPDATE Resource SET favoritesCount = MAX(0, COALESCE(favoritesCount, 0) - 1) WHERE id = ?"
      ).bind(resourceId).run();
      return NextResponse.json({ favorited: false });
    } else {
      // Add favorite
      const id = `cufav${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      await db.prepare(
        'INSERT INTO Favorite (id, userId, resourceId, createdAt) VALUES (?, ?, ?, ?)'
      ).bind(id, user.id, resourceId, Date.now()).run();
      await db.prepare(
        'UPDATE Resource SET favoritesCount = COALESCE(favoritesCount, 0) + 1 WHERE id = ?'
      ).bind(resourceId).run();
      return NextResponse.json({ favorited: true });
    }
  } catch (e: any) {
    console.error('[favorites] error:', e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ favorited: false });

    const { resourceId } = await params;
    const db = await getD1();
    if (!db) return NextResponse.json({ favorited: false });

    const existing: any = await db.prepare(
      'SELECT id FROM Favorite WHERE userId = ? AND resourceId = ? LIMIT 1'
    ).bind(user.id, resourceId).first();

    return NextResponse.json({ favorited: !!existing });
  } catch (e: any) {
    return NextResponse.json({ favorited: false });
  }
}

// @ts-nocheck
// 2026-09-14: Migrated from Prisma (Neon dead) to D1 (SQLite).
// Prisma endpoint was writing to a disconnected Neon DB — all new ratings
// were lost and Resource.avgRating/ratingCount never updated.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/lib/auth';

async function getD1() {
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const stars = parseInt(body.stars, 10);
  const review: string | null = (body.review && String(body.review).slice(0, 1000)) || null;

  if (!stars || stars < 1 || stars > 5) {
    return NextResponse.json({ error: 'Note invalide (1-5 étoiles)' }, { status: 400 });
  }

  try {
    const db = await getD1();
    const now = Date.now();

    // Check if rating exists
    const existing: any = await db
      .prepare('SELECT id FROM Rating WHERE resourceId = ? AND userId = ? LIMIT 1')
      .bind(id, user.id)
      .first();

    if (existing) {
      // Update existing rating
      await db
        .prepare('UPDATE Rating SET value = ?, createdAt = ? WHERE id = ?')
        .bind(stars, now, existing.id)
        .run();
    } else {
      // Insert new rating
      await db
        .prepare(
          'INSERT INTO Rating (id, resourceId, userId, value, createdAt) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(crypto.randomUUID(), id, user.id, stars, now)
        .run();
    }

    // Recompute aggregate (avgRating + ratingCount) from the Rating table
    const agg: any = await db
      .prepare(
        'SELECT AVG(value) AS avgRating, COUNT(*) AS ratingCount FROM Rating WHERE resourceId = ?',
      )
      .bind(id)
      .first();

    await db
      .prepare('UPDATE Resource SET avgRating = ?, ratingsCount = ? WHERE id = ?')
      .bind(agg.avgRating || 0, agg.ratingCount || 0, id)
      .run();

    return NextResponse.json({
      success: true,
      rating: { stars, review, userId: user.id, resourceId: id },
      aggregate: {
        avgRating: agg.avgRating || 0,
        ratingCount: agg.ratingCount || 0,
      },
    });
  } catch (e: any) {
    console.error('[rating POST] error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

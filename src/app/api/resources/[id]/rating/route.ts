// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/lib/auth';
import { notifyAdminsNewRating } from '@/lib/admin-notify';

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = await getD1();
    if (!db) return NextResponse.json({ avgRating: 0, ratingCount: 0, userRating: null });

    const stats: any = await db.prepare(
      "SELECT COALESCE(AVG(value), 0) as avgRating, COUNT(*) as ratingCount FROM Rating WHERE resourceId = ?"
    ).bind(id).first();

    let userRating: number | null = null;
    const user = await getCurrentUser();
    if (user) {
      const r: any = await db.prepare(
        "SELECT value FROM Rating WHERE resourceId = ? AND userId = ? LIMIT 1"
      ).bind(id, user.id).first();
      userRating = r?.value || null;
    }

    return NextResponse.json({
      avgRating: stats?.avgRating || 0,
      ratingCount: stats?.ratingCount || 0,
      userRating,
    });
  } catch (e: any) {
    return NextResponse.json({ avgRating: 0, ratingCount: 0, userRating: null, error: e?.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const value = parseInt(body?.value);
    // 2026-09-04: review field is optional (legacy bug: undefined variable crashed the response)
    const review = typeof body?.review === 'string' ? body.review.trim() || null : null;

    if (!value || value < 1 || value > 5) {
      return NextResponse.json({ error: 'Note invalide (1-5)' }, { status: 400 });
    }

    const db = await getD1();
    if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

    const now = Date.now();
    const existing: any = await db.prepare(
      "SELECT id FROM Rating WHERE resourceId = ? AND userId = ? LIMIT 1"
    ).bind(id, user.id).first();

    if (existing) {
      // Update
      await db.prepare(
        "UPDATE Rating SET value = ? WHERE id = ?"
      ).bind(value, existing.id).run();
    } else {
      // Create
      const id2 = `curat${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      await db.prepare(
        "INSERT INTO Rating (id, resourceId, userId, value, createdAt) VALUES (?, ?, ?, ?, ?)"
      ).bind(id2, id, user.id, value, now).run();
    }

    // Update resource aggregate
    const agg: any = await db.prepare(
      "SELECT COALESCE(AVG(value), 0) as avg, COUNT(*) as count FROM Rating WHERE resourceId = ?"
    ).bind(id).first();
    
    await db.prepare(
      "UPDATE Resource SET avgRating = ?, ratingsCount = ? WHERE id = ?"
    ).bind(agg?.avg || 0, agg?.count || 0, id).run();

    // 2026-09-09: Notify admin about new rating (in-app + email)
    await notifyAdminsNewRating({
      studentId: user.id,
      resourceId: id,
      value,
      review,
    }).catch((e) => console.error('[rating POST] admin notify error:', e));

    return NextResponse.json({
      value,
      review,
      avgRating: agg?.avg || 0,
      ratingCount: agg?.count || 0,
    });
  } catch (e: any) {
    console.error('[rating POST] error:', e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

/**
 * DELETE /api/resources/[id]/rating
 *
 * Delete the current user's rating on this resource.
 * 
 * 2026-09-07: Added — students can now remove their own ratings from
 * /mon-compte/commentaires page.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { id: resourceId } = await params;
    const db = await getD1();
    if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

    // Verify the rating exists and belongs to the user
    const rating: any = await db.prepare(
      'SELECT id FROM Rating WHERE resourceId = ? AND userId = ? LIMIT 1'
    ).bind(resourceId, user.id).first();
    if (!rating) {
      return NextResponse.json({ error: 'Aucune note trouvée' }, { status: 404 });
    }

    // Hard-delete the rating
    await db.prepare(
      'DELETE FROM Rating WHERE id = ?'
    ).bind(rating.id).run();

    // Recompute avgRating + ratingsCount
    const stats: any = await db.prepare(
      'SELECT COALESCE(AVG(value), 0) as avgRating, COUNT(*) as ratingCount FROM Rating WHERE resourceId = ?'
    ).bind(resourceId).first();

    await db.prepare(
      'UPDATE Resource SET avgRating = ?, ratingsCount = ? WHERE id = ?'
    ).bind(stats?.avgRating || 0, stats?.ratingCount || 0, resourceId).run();

    return NextResponse.json({
      success: true,
      deletedId: rating.id,
      avgRating: stats?.avgRating || 0,
      ratingCount: stats?.ratingCount || 0,
    });
  } catch (e: any) {
    console.error('[rating DELETE] error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 });
  }
}

// @ts-nocheck
/**
 * POST /api/resources/[id]/report
 *
 * 2026-09-04: Added so students can report inappropriate resources.
 * The "Signaler" button in ResourceActions.tsx was previously a no-op
 * (just a toast). This endpoint creates a Report row that the admin
 * moderation page can review.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_REASONS = [
  'INAPPROPRIATE',
  'COPYRIGHT',
  'SPAM',
  'WRONG_CONTENT',
  'BROKEN_FILE',
  'OTHER',
] as const;

function genId() {
  return `curep${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { id: resourceId } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = (body?.reason || '').toString().toUpperCase();
    const details = (body?.details || '').toString().trim().slice(0, 1000) || null;

    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: 'Raison invalide', validReasons: VALID_REASONS },
        { status: 400 },
      );
    }

    const db = await getD1();
    if (!db) {
      return NextResponse.json({ error: 'DB not available' }, { status: 503 });
    }

    // Verify the resource exists
    const resource: any = await db
      .prepare('SELECT id, title, status FROM Resource WHERE id = ? LIMIT 1')
      .bind(resourceId)
      .first();
    if (!resource) {
      return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
    }

    // Prevent duplicate pending reports from same user
    const existing: any = await db
      .prepare(
        "SELECT id FROM Report WHERE resourceId = ? AND userId = ? AND status = 'PENDING' LIMIT 1",
      )
      .bind(resourceId, user.id)
      .first();
    if (existing) {
      return NextResponse.json(
        { error: 'Vous avez déjà signalé cette ressource. Un modérateur va l\'examiner.' },
        { status: 409 },
      );
    }

    const reportId = genId();
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO Report (id, resourceId, userId, reason, details, status, createdAt)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      )
      .bind(reportId, resourceId, user.id, reason, details, now)
      .run();

    return NextResponse.json({
      success: true,
      reportId,
      message: 'Signalement envoyé. Merci, un modérateur va l\'examiner.',
    });
  } catch (e: any) {
    console.error('[report POST] error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

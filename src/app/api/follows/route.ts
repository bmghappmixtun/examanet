// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

// POST /api/follows { teacherId } - toggle follow
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { teacherId } = await req.json();
  if (!teacherId) return NextResponse.json({ error: 'teacherId requis' }, { status: 400 });
  if (teacherId === user.id)
    return NextResponse.json({ error: 'Impossible de se suivre soi-même' }, { status: 400 });

  const db = await getD1();

  // Verify teacher exists
  const teacher = await db
    .prepare("SELECT id FROM User WHERE id = ? AND role = 'TEACHER' LIMIT 1")
    .bind(teacherId)
    .first();
  if (!teacher) return NextResponse.json({ error: 'Professeur introuvable' }, { status: 404 });

  // Check existing
  const existing = await db
    .prepare(
      'SELECT id FROM Follow WHERE followerId = ? AND followingId = ? LIMIT 1',
    )
    .bind(user.id, teacherId)
    .first();

  if (existing) {
    // Unfollow
    await db
      .prepare('DELETE FROM Follow WHERE id = ?')
      .bind(existing.id)
      .run();
  } else {
    // Follow
    await db
      .prepare(
        'INSERT INTO Follow (id, followerId, followingId, createdAt) VALUES (?, ?, ?, ?)',
      )
      .bind(genId(), user.id, teacherId, Date.now())
      .run();

    // Notify teacher
    await db
      .prepare(
        `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt)
         VALUES (?, ?, 'new_follower', 'Nouveau follower 👋', ?, ?, 0, ?)`,
      )
      .bind(
        genId(),
        teacherId,
        `${user.firstName || 'Un utilisateur'} ${user.lastName || ''} vous suit maintenant.`,
        `/profil/${user.id}`,
        Date.now(),
      )
      .run();
  }

  // Get fresh count
  const countResult = await db
    .prepare('SELECT COUNT(*) as c FROM Follow WHERE followingId = ?')
    .bind(teacherId)
    .first();

  return NextResponse.json({
    following: !existing,
    followersCount: countResult?.c || 0,
  });
}

// GET /api/follows?teacherId=xxx - check follow status
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const teacherId = req.nextUrl.searchParams.get('teacherId');
  if (!teacherId) return NextResponse.json({ error: 'teacherId requis' }, { status: 400 });

  const db = await getD1();
  const countResult = await db
    .prepare('SELECT COUNT(*) as c FROM Follow WHERE followingId = ?')
    .bind(teacherId)
    .first();

  let following = false;
  if (user) {
    const follow = await db
      .prepare(
        'SELECT id FROM Follow WHERE followerId = ? AND followingId = ? LIMIT 1',
      )
      .bind(user.id, teacherId)
      .first();
    following = !!follow;
  }

  return NextResponse.json({ following, followersCount: countResult?.c || 0 });
}

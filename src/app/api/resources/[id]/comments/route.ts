// @ts-nocheck
// 2026-09-14: Migrated from Prisma (Neon dead) to D1 (SQLite).
// Prisma endpoint was writing to a disconnected Neon DB — all new comments
// were lost. Now they go to the live D1 database.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/lib/auth';

async function getD1() {
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = await getD1();
    const r: any = await db
      .prepare(
        `SELECT c.id, c.content, c.createdAt, c.userId,
                u.firstName, u.lastName, u.avatarUrl
         FROM Comment c
         LEFT JOIN User u ON u.id = c.userId
         WHERE c.resourceId = ? AND c.isHidden = 0 AND c.parentId IS NULL
         ORDER BY c.createdAt DESC
         LIMIT 100`,
      )
      .bind(id)
      .all();
    const comments = (r?.results || []).map((row: any) => ({
      id: row.id,
      content: row.content,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      userId: row.userId,
      user: {
        firstName: row.firstName || '',
        lastName: row.lastName || '',
        avatarUrl: row.avatarUrl || null,
      },
    }));
    return NextResponse.json({ comments });
  } catch (e: any) {
    console.error('[comments GET] error:', e?.message);
    return NextResponse.json({ comments: [], error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { id } = await params;
  const { content } = await req.json();
  if (!content || content.length < 3 || content.length > 1000) {
    return NextResponse.json({ error: 'Commentaire invalide (3-1000 caractères)' }, { status: 400 });
  }

  try {
    const db = await getD1();

    // Look up resource to get teacherId for notification + numericId/slug for link
    const resource: any = await db
      .prepare(
        'SELECT id, numericId, slug, title, teacherId FROM Resource WHERE id = ? LIMIT 1',
      )
      .bind(id)
      .first();
    if (!resource) return NextResponse.json({ error: 'Ressource non trouvée' }, { status: 404 });

    const now = Date.now();
    const commentId = crypto.randomUUID();

    // Insert comment
    await db
      .prepare(
        'INSERT INTO Comment (id, resourceId, userId, content, isHidden, createdAt, updatedAt) VALUES (?, ?, ?, ?, 0, ?, ?)',
      )
      .bind(commentId, id, user.id, content, now, now)
      .run();

    // Increment commentsCount on Resource
    await db
      .prepare('UPDATE Resource SET commentsCount = commentsCount + 1 WHERE id = ?')
      .bind(id)
      .run()
      .catch(() => {});

    // Notify teacher (if not the same user)
    if (resource.teacherId && resource.teacherId !== user.id) {
      try {
        await db
          .prepare(
            `INSERT INTO Notification (id, userId, type, title, message, link, isRead, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            resource.teacherId,
            'new_comment',
            'Nouveau commentaire',
            `${user.firstName || ''} ${user.lastName || ''} a commenté votre ressource "${resource.title}"`,
            `/fr/ressources/${resource.numericId}/${resource.slug}`,
            now,
          )
          .run();
      } catch (e) {
        // Notification is best-effort
      }
    }

    // Return the inserted comment with user info
    const comment = {
      id: commentId,
      content,
      createdAt: new Date(now).toISOString(),
      userId: user.id,
      user: {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        avatarUrl: user.avatarUrl || null,
      },
    };
    return NextResponse.json({ comment }, { status: 201 });
  } catch (e: any) {
    console.error('[comments POST] error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

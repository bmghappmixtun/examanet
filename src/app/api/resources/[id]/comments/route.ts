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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = await getD1();
    if (!db) return NextResponse.json({ comments: [] });

    const r = await db.prepare(`
      SELECT c.id, c.content,  c.createdAt,
             c.userId, u.firstName, u.lastName, u.avatarUrl
      FROM Comment c
      LEFT JOIN User u ON c.userId = u.id
      WHERE c.resourceId = ? AND c.isHidden = 0
      ORDER BY c.createdAt DESC
      LIMIT 50
    `).bind(id).all();

    const comments = (r?.results || []).map((c: any) => ({
      id: c.id,
      content: c.content,
      parentId: c.parentId,
      likes: 0,
      createdAt: c.createdAt,
      // 2026-09-07: Return BOTH 'user' (new canonical name) and 'author' (legacy)
      // for backward compat with old clients.
      user: c.userId ? {
        id: c.userId,
        firstName: c.firstName,
        lastName: c.lastName,
        avatarUrl: c.avatarUrl,
      } : null,
      author: c.userId ? {
        id: c.userId,
        firstName: c.firstName,
        lastName: c.lastName,
        avatarUrl: c.avatarUrl,
      } : null,
    }));

    return NextResponse.json({ comments });
  } catch (e: any) {
    return NextResponse.json({ comments: [], error: e?.message }, { status: 500 });
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
    const content = (body?.content || '').trim();
    if (!content) {
      return NextResponse.json({ error: 'Commentaire vide' }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: 'Commentaire trop long (max 2000)' }, { status: 400 });
    }

    const db = await getD1();
    if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

    const commentId = `cucom${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const parentId = body?.parentId || null;

    await db.prepare(
      'INSERT INTO Comment (id, resourceId, userId, content, isHidden, createdAt, updatedAt) VALUES (?, ?, ?, ?, 0, ?, ?)'
    ).bind(commentId, id, user.id, content, now, now).run();

    // Update comment count
    await db.prepare(
      "UPDATE Resource SET commentsCount = COALESCE(commentsCount, 0) + 1 WHERE id = ?"
    ).bind(id).run();

    return NextResponse.json({
      comment: {
        id: commentId,
        content,
        parentId,
        likes: 0,
        createdAt: new Date(now).toISOString(),
        createdAtLabel: 'à l\'instant',
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: user.avatarUrl,
        },
      },
    });
  } catch (e: any) {
    console.error('[comments POST] error:', e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}


/**
 * DELETE /api/resources/[id]/comments
 *
 * Delete a specific comment by the current user (or admin).
 * Body: { commentId: string }
 * 
 * 2026-09-07: Added — students can now manage their own comments from
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
    const body = await req.json().catch(() => ({}));
    const commentId = body?.commentId;
    if (!commentId) {
      return NextResponse.json({ error: 'commentId requis' }, { status: 400 });
    }

    const db = await getD1();
    if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

    // Fetch the comment first to verify ownership
    const comment: any = await db.prepare(
      'SELECT id, userId, resourceId, isHidden FROM Comment WHERE id = ? LIMIT 1'
    ).bind(commentId).first();
    if (!comment) {
      return NextResponse.json({ error: 'Commentaire introuvable' }, { status: 404 });
    }
    if (comment.resourceId !== resourceId) {
      return NextResponse.json({ error: 'Commentaire pas lié à cette ressource' }, { status: 400 });
    }
    if (user.role !== 'ADMIN' && comment.userId !== user.id) {
      return NextResponse.json({ error: 'Vous n\'êtes pas l\'auteur de ce commentaire' }, { status: 403 });
    }

    // Soft-delete: set isHidden=1 (preserves the row for reply threading)
    const now = Date.now();
    await db.prepare(
      'UPDATE Comment SET isHidden = 1, updatedAt = ? WHERE id = ?'
    ).bind(now, commentId).run();

    // Decrement comment count
    await db.prepare(
      'UPDATE Resource SET commentsCount = MAX(0, COALESCE(commentsCount, 0) - 1) WHERE id = ?'
    ).bind(resourceId).run();

    return NextResponse.json({ success: true, deletedId: commentId });
  } catch (e: any) {
    console.error('[comments DELETE] error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 });
  }
}

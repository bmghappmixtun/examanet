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
      id: commentId,
      content,
      parentId,
      likes: 0,
      createdAt: now,
      author: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (e: any) {
    console.error('[comments POST] error:', e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

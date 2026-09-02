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

// GET /api/conversations/[id]/messages - list messages
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { id } = await params;
  const db = await getD1();

  // Verify user is part of conversation
  const conv = await db
    .prepare(
      'SELECT * FROM Conversation WHERE id = ? AND (user1Id = ? OR user2Id = ?) LIMIT 1',
    )
    .bind(id, user.id, user.id)
    .first();
  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 });

  // List messages with sender info
  const messagesResult = await db
    .prepare(
      `SELECT m.*, u.id as s_id, u.firstName as s_firstName, u.lastName as s_lastName, u.avatarUrl as s_avatarUrl
       FROM Message m
       LEFT JOIN User u ON m.senderId = u.id
       WHERE m.conversationId = ?
       ORDER BY m.createdAt ASC`,
    )
    .bind(id)
    .all();
  const rawMessages = (messagesResult as any).results || messagesResult;

  const messages = rawMessages.map((m: any) => ({
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content,
    isRead: m.isRead,
    readAt: m.readAt,
    createdAt: m.createdAt,
    sender: m.s_id ? { id: m.s_id, firstName: m.s_firstName, lastName: m.s_lastName, avatarUrl: m.s_avatarUrl } : null,
  }));

  // Mark unread messages (not from this user) as read
  await db
    .prepare(
      `UPDATE Message SET isRead = 1, readAt = ?
       WHERE conversationId = ? AND senderId != ? AND isRead = 0`,
    )
    .bind(Date.now(), id, user.id)
    .run();

  return NextResponse.json({ messages, conversation: conv });
}

// POST /api/conversations/[id]/messages { content } - send message
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { id } = await params;
  const { content } = await req.json();

  if (!content || !content.trim())
    return NextResponse.json({ error: 'Message vide' }, { status: 400 });
  if (content.length > 2000)
    return NextResponse.json({ error: 'Message trop long (max 2000)' }, { status: 400 });

  const db = await getD1();

  // Verify user is part of conversation
  const conv = await db
    .prepare(
      'SELECT * FROM Conversation WHERE id = ? AND (user1Id = ? OR user2Id = ?) LIMIT 1',
    )
    .bind(id, user.id, user.id)
    .first();
  if (!conv) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 });

  // Create message
  const messageId = genId();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO Message (id, conversationId, senderId, content, isRead, createdAt)
       VALUES (?, ?, ?, ?, 0, ?)`,
    )
    .bind(messageId, id, user.id, content.trim(), now)
    .run();

  // Update conversation lastMessageAt
  await db
    .prepare('UPDATE Conversation SET lastMessageAt = ? WHERE id = ?')
    .bind(now, id)
    .run();

  // Notify the other party
  const otherUserId = user.id === conv.user1Id ? conv.user2Id : conv.user1Id;
  const otherUser = await db
    .prepare('SELECT id FROM User WHERE id = ? LIMIT 1')
    .bind(otherUserId)
    .first();
  if (otherUser) {
    const preview = content.length > 80 ? content.substring(0, 80) + '...' : content;
    await db
      .prepare(
        `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt)
         VALUES (?, ?, 'new_message', 'Nouveau message 💬', ?, ?, 0, ?)`,
      )
      .bind(
        genId(),
        otherUserId,
        `${user.firstName || 'Utilisateur'}: ${preview}`,
        `/messages/${id}`,
        now,
      )
      .run();
  }

  // Return message with sender info
  const message = await db
    .prepare(
      `SELECT m.*, u.id as s_id, u.firstName as s_firstName, u.lastName as s_lastName, u.avatarUrl as s_avatarUrl
       FROM Message m
       LEFT JOIN User u ON m.senderId = u.id
       WHERE m.id = ?`,
    )
    .bind(messageId)
    .first();

  return NextResponse.json({ message });
}

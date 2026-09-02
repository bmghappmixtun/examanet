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

// GET /api/conversations - list user's conversations
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const db = await getD1();

  // Get conversations where user is user1 or user2
  const conversations = await db
    .prepare(
      `SELECT c.*, 
        u1.id as u1_id, u1.firstName as u1_firstName, u1.lastName as u1_lastName, u1.avatarUrl as u1_avatarUrl,
        u2.id as u2_id, u2.firstName as u2_firstName, u2.lastName as u2_lastName, u2.avatarUrl as u2_avatarUrl, u2.schoolName as u2_schoolName
       FROM Conversation c
       LEFT JOIN User u1 ON c.user1Id = u1.id
       LEFT JOIN User u2 ON c.user2Id = u2.id
       WHERE c.user1Id = ? OR c.user2Id = ?
       ORDER BY COALESCE(c.lastMessageAt, c.createdAt) DESC`,
    )
    .bind(user.id, user.id)
    .all();
  const convs = (conversations as any).results || conversations;

  // For each conv, get the latest message + unread count
  const result = [];
  for (const c of convs) {
    const lastMsgResult = await db
      .prepare(
        `SELECT content, senderId, createdAt FROM Message
         WHERE conversationId = ? ORDER BY createdAt DESC LIMIT 1`,
      )
      .bind(c.id)
      .first();

    const unreadResult = await db
      .prepare(
        `SELECT COUNT(*) as c FROM Message
         WHERE conversationId = ? AND isRead = 0 AND senderId != ?`,
      )
      .bind(c.id, user.id)
      .first();

    result.push({
      id: c.id,
      user1Id: c.user1Id,
      user2Id: c.user2Id,
      student: c.user1Id === user.id ? { id: c.u2_id, firstName: c.u2_firstName, lastName: c.u2_lastName, avatarUrl: c.u2_avatarUrl, schoolName: c.u2_schoolName } : { id: c.u1_id, firstName: c.u1_firstName, lastName: c.u1_lastName, avatarUrl: c.u1_avatarUrl },
      teacher: c.user1Id !== user.id ? { id: c.u2_id, firstName: c.u2_firstName, lastName: c.u2_lastName, avatarUrl: c.u2_avatarUrl, schoolName: c.u2_schoolName } : { id: c.u1_id, firstName: c.u1_firstName, lastName: c.u1_lastName, avatarUrl: c.u1_avatarUrl },
      messages: lastMsgResult ? [{ content: lastMsgResult.content, senderId: lastMsgResult.senderId, createdAt: lastMsgResult.createdAt }] : [],
      unread: unreadResult?.c || 0,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
    });
  }

  return NextResponse.json({ conversations: result });
}

// POST /api/conversations { otherUserId } - create or get conversation
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { otherUserId } = await req.json();
  if (!otherUserId) return NextResponse.json({ error: 'otherUserId requis' }, { status: 400 });

  const db = await getD1();

  // Check the other user exists
  const other = await db
    .prepare('SELECT id, role FROM User WHERE id = ? LIMIT 1')
    .bind(otherUserId)
    .first();
  if (!other) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

  // Order the user IDs consistently (user1Id < user2Id)
  const [user1Id, user2Id] = [user.id, otherUserId].sort();

  // Find existing conversation
  const existing = await db
    .prepare(
      'SELECT * FROM Conversation WHERE user1Id = ? AND user2Id = ? LIMIT 1',
    )
    .bind(user1Id, user2Id)
    .first();

  if (existing) {
    return NextResponse.json({ conversation: existing });
  }

  // Create new conversation
  const convId = genId();
  const now = Date.now();
  await db
    .prepare(
      'INSERT INTO Conversation (id, user1Id, user2Id, createdAt) VALUES (?, ?, ?, ?)',
    )
    .bind(convId, user1Id, user2Id, now)
    .run();

  const conv = await db
    .prepare('SELECT * FROM Conversation WHERE id = ? LIMIT 1')
    .bind(convId)
    .first();

  return NextResponse.json({ conversation: conv });
}

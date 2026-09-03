// @ts-nocheck
/**
 * D1-based messages/conversations helpers.
 * 2026-09-03: Replaces prisma-compat for the messages inbox.
 *
 * Schema differences (Prisma → D1):
 * - Conversation: studentId/teacherId → user1Id/user2Id (sorted alphabetically)
 * - Conversation: no "unread" field (counted from Message)
 * - Message: isRead is boolean (Prisma: enum)
 */

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export interface ConversationRow {
  id: string;
  user1Id: string;
  user2Id: string;
  lastMessageAt: number | null;
  createdAt: number;
  otherUser: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
  lastMessage: {
    content: string;
    senderId: string;
    createdAt: number;
  } | null;
  unread: number;
}

/**
 * Get all conversations for a user with other-user info, last message, and unread count.
 */
export async function getConversationsForUser(userId: string, limit = 50): Promise<ConversationRow[]> {
  const db = await getD1();
  if (!db) return [];

  // Single query: conversations + other user + last message
  const res: any = await db.prepare([
    "SELECT",
    "  c.id, c.user1Id, c.user2Id, c.lastMessageAt, c.createdAt,",
    "  CASE WHEN c.user1Id = ? THEN c.user2Id ELSE c.user1Id END as otherUserId,",
    "  u.firstName as other_firstName, u.lastName as other_lastName, u.avatarUrl as other_avatarUrl,",
    "  m.content as last_content, m.senderId as last_senderId, m.createdAt as last_createdAt",
    "FROM Conversation c",
    "INNER JOIN User u ON u.id = CASE WHEN c.user1Id = ? THEN c.user2Id ELSE c.user1Id END",
    "LEFT JOIN Message m ON m.id = (SELECT id FROM Message WHERE conversationId = c.id ORDER BY createdAt DESC LIMIT 1)",
    "WHERE c.user1Id = ? OR c.user2Id = ?",
    "ORDER BY c.lastMessageAt DESC NULLS LAST",
    "LIMIT ?",
  ].join(' ')).bind(userId, userId, userId, userId, limit).all();

  const rows = (res?.results || []) as any[];

  // Batch fetch unread counts
  if (rows.length === 0) return [];
  const convIds = rows.map(r => r.id);
  const placeholders = convIds.map(() => '?').join(',');
  const unreadRes: any = await db.prepare(
    `SELECT conversationId, COUNT(*) as unread FROM Message WHERE conversationId IN (${placeholders}) AND isRead = 0 AND senderId != ? GROUP BY conversationId`
  ).bind(...convIds, userId).all();
  const unreadMap = new Map<string, number>(((unreadRes?.results || []) as any[]).map(r => [r.conversationId, r.unread]));

  return rows.map(r => ({
    id: r.id,
    user1Id: r.user1Id,
    user2Id: r.user2Id,
    lastMessageAt: r.lastMessageAt,
    createdAt: r.createdAt,
    otherUser: {
      id: r.otherUserId,
      firstName: r.other_firstName,
      lastName: r.other_lastName,
      avatarUrl: r.other_avatarUrl,
    },
    lastMessage: r.last_content ? {
      content: r.last_content,
      senderId: r.last_senderId,
      createdAt: r.last_createdAt,
    } : null,
    unread: unreadMap.get(r.id) || 0,
  }));
}

/**
 * Get a single conversation with messages.
 */
export async function getConversationWithMessages(conversationId: string, userId: string) {
  const db = await getD1();
  if (!db) return null;

  // Check user is part of conversation
  const conv: any = await db.prepare(
    "SELECT id, user1Id, user2Id, lastMessageAt, createdAt FROM Conversation WHERE id = ?"
  ).bind(conversationId).first();
  if (!conv) return null;
  if (conv.user1Id !== userId && conv.user2Id !== userId) return null;

  // Get the other user
  const otherUserId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;
  const otherUser: any = await db.prepare(
    "SELECT id, firstName, lastName, avatarUrl, schoolName FROM User WHERE id = ?"
  ).bind(otherUserId).first();

  // Get messages with sender info via JOIN
  const msgsRes: any = await db.prepare([
    "SELECT m.id, m.senderId, m.content, m.isRead, m.readAt, m.createdAt,",
    "u.id as s_id, u.firstName as s_firstName, u.lastName as s_lastName, u.avatarUrl as s_avatarUrl",
    "FROM Message m",
    "LEFT JOIN User u ON u.id = m.senderId",
    "WHERE m.conversationId = ?",
    "ORDER BY m.createdAt ASC LIMIT 200",
  ].join(' ')).bind(conversationId).all();
  const messages = ((msgsRes?.results || []) as any[]).map((m: any) => ({
    id: m.id,
    senderId: m.senderId,
    content: m.content,
    isRead: !!m.isRead,
    readAt: m.readAt,
    createdAt: m.createdAt,
    sender: m.s_id ? {
      id: m.s_id,
      firstName: m.s_firstName,
      lastName: m.s_lastName,
      avatarUrl: m.s_avatarUrl,
    } : null,
  }));

  // Mark unread as read (only messages not from current user)
  await db.prepare(
    "UPDATE Message SET isRead = 1, readAt = ? WHERE conversationId = ? AND isRead = 0 AND senderId != ?"
  ).bind(Date.now(), conversationId, userId).run();

  // Return both D1 and Prisma-compatible shape (student/teacher both = otherUser)
  const other = otherUser || { id: otherUserId, firstName: null, lastName: null, avatarUrl: null, schoolName: null, numericId: null, slug: null };
  return {
    conversation: conv,
    otherUser: other,
    student: other, // Prisma compat
    teacher: other, // Prisma compat
    messages,
  };
}

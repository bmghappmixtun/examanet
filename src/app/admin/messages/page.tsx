// @ts-nocheck
// Admin page: contact form messages (ContactMessage table).
// 2026-09-07: New page, full D1-backed implementation.

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import MessagesClient from '@/components/admin/MessagesClient';

export const dynamic = 'force-dynamic';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export default async function AdminMessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  const db = await getD1();
  if (!db) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        ⚠️ Base de données indisponible. Réessayez dans quelques instants.
      </div>
    );
  }

  // Fetch all messages (limited to 200 for performance)
  const messagesRes = await db.prepare(`
    SELECT id, name, email, subject, message, status, repliedAt, createdAt
    FROM ContactMessage
    ORDER BY createdAt DESC
    LIMIT 200
  `).all().catch((e: any) => {
    console.error('[messages] query error:', e);
    return { results: [] };
  });

  const messages = (messagesRes?.results || []).map((m: any) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    subject: m.subject,
    message: m.message,
    status: m.status,
    repliedAt: m.repliedAt ? Number(m.repliedAt) : null,
    createdAt: Number(m.createdAt),
  }));

  // Compute stats
  const total = messages.length;
  const pending = messages.filter((m: any) => m.status === 'PENDING').length;
  const replied = messages.filter((m: any) => m.status === 'REPLIED').length;
  const archived = messages.filter((m: any) => m.status === 'ARCHIVED').length;
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = messages.filter((m: any) => m.createdAt > oneWeekAgo).length;

  return (
    <MessagesClient
      initialMessages={messages}
      stats={{ total, pending, replied, archived, thisWeek }}
    />
  );
}

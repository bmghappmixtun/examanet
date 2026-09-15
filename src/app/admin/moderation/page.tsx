// @ts-nocheck
// 2026-09-15: Server component fetches reports via raw SQL (the proxy doesn't
// support joins), then hands off to ModerationClient for interactive state.
import { redirect } from 'next/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getCurrentUser } from '@/lib/auth';
import ModerationClient, { type ReportRow } from '@/components/admin/ModerationClient';

export const dynamic = 'force-dynamic';

async function getD1() {
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB || null;
}

async function fetchReports(statusFilter: 'PENDING' | 'ALL_NON_PENDING', limit = 10): Promise<ReportRow[]> {
  const db = await getD1();
  if (!db) return [];
  const whereSql =
    statusFilter === 'PENDING'
      ? "WHERE r.status = 'PENDING'"
      : "WHERE r.status != 'PENDING'";
  try {
    const res: any = await db
      .prepare(
        `SELECT
          r.id, r.resourceId, r.userId, r.reason, r.details, r.status,
          r.reviewedById, r.reviewedAt, r.createdAt,
          res.title AS resourceTitle,
          res.numericId AS resourceNumericId,
          res.slug AS resourceSlug,
          s.nameFr AS resourceSubject,
          u.firstName AS reporterFirstName,
          u.lastName AS reporterLastName,
          u.email AS reporterEmail
        FROM Report r
        LEFT JOIN Resource res ON res.id = r.resourceId
        LEFT JOIN Subject s ON s.id = res.subjectId
        LEFT JOIN User u ON u.id = r.userId
        ${whereSql}
        ORDER BY r.createdAt DESC
        LIMIT ?`,
      )
      .bind(limit)
      .all();
    return (res?.results || []) as ReportRow[];
  } catch (e: any) {
    console.error('[moderation] fetchReports error:', e?.message);
    return [];
  }
}

export default async function AdminModerationPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');

  const [pendingReports, resolvedReports, totalResult] = await Promise.all([
    fetchReports('PENDING', 100),
    fetchReports('ALL_NON_PENDING', 10),
    (async () => {
      const db = await getD1();
      if (!db) return { c: 0 };
      try {
        return await db.prepare('SELECT COUNT(*) as c FROM Report').first();
      } catch {
        return { c: 0 };
      }
    })(),
  ]);
  const totalReports = Number(totalResult?.c || 0);

  return (
    <ModerationClient
      initialPending={pendingReports}
      initialResolved={resolvedReports}
      totalReports={totalReports}
    />
  );
}

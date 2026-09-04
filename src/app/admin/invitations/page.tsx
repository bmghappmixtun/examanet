// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import InvitationsClient from '@/components/admin/InvitationsClient';
import { expireStaleInvitations } from '@/lib/invitation';
import { d1All, d1First } from '@/lib/db-d1';

export const dynamic = 'force-dynamic';

export default async function AdminInvitationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  // Auto-expire stale invitations on page load
  await expireStaleInvitations();

  // Fetch invitations with teacher + invitedBy joined (raw SQL — d1-admin proxy
  // doesn't support nested include for joins).
  const rows = await d1All(`
    SELECT
      ti.id, ti.email, ti.token, ti.status, ti.message, ti.customMessage,
      ti.expiresAt, ti.acceptedAt, ti.invitationSentAt, ti.invitationActivatedAt,
      ti.createdAt, ti.clickCount, ti.resendMessageId, ti.deliveryStatus,
      ti.deliverySyncedAt, ti.activateIpAddress, ti.activateUserAgent,
      ti.teacherId,
      t.id AS t_id, t.firstName AS t_firstName, t.lastName AS t_lastName,
      t.email AS t_email,
      (SELECT COUNT(*) FROM Resource r WHERE r.teacherId = t.id) AS t_filesCount,
      ib.id AS ib_id, ib.firstName AS ib_firstName, ib.lastName AS ib_lastName,
      ib.email AS ib_email
    FROM TeacherInvitation ti
    LEFT JOIN "User" t ON t.id = ti.teacherId
    LEFT JOIN "User" ib ON ib.id = ti.invitedById
    ORDER BY ti.createdAt DESC
    LIMIT 200
  `);

  // Map rows → Invitation client type
  const invitations = rows.map((row: any) => ({
    id: row.id,
    token: row.token,
    email: row.email,
    status: row.status,
    createdAt: row.createdAt,
    emailSentAt: row.invitationSentAt ?? null,
    linkClickedAt: null, // not tracked in D1
    activatedAt: row.acceptedAt ?? row.invitationActivatedAt ?? null,
    cancelledAt: null, // not tracked in D1
    expiresAt: row.expiresAt,
    clickCount: row.clickCount || 0,
    clickIpAddress: null, // not tracked in D1
    activateIpAddress: row.activateIpAddress ?? null,
    customMessage: row.customMessage ?? row.message ?? null,
    resendMessageId: row.resendMessageId ?? null,
    deliveryStatus: row.deliveryStatus ?? null,
    deliverySyncedAt: row.deliverySyncedAt ?? null,
    deliveryDetail: null, // not tracked in D1
    openedAt: null, // not tracked in D1
    openCount: 0, // not tracked in D1
    teacher: {
      id: row.t_id,
      firstName: row.t_firstName,
      lastName: row.t_lastName,
      email: row.t_email || row.email,
      _count: { uploadedFiles: row.t_filesCount || 0 },
    },
    invitedBy: row.ib_id
      ? {
          id: row.ib_id,
          firstName: row.ib_firstName,
          lastName: row.ib_lastName,
          email: row.ib_email,
        }
      : null,
  }));

  // Group counts per status
  const statusRows = await d1All(`
    SELECT status, COUNT(*) AS c FROM TeacherInvitation GROUP BY status
  `);
  const stats: Record<string, number> = {
    PENDING: 0,
    SENT: 0,
    CLICKED: 0,
    ACTIVATED: 0,
    EXPIRED: 0,
    CANCELLED: 0,
  };
  for (const r of statusRows) {
    if (r.status in stats) stats[r.status] = r.c;
  }

  // CLICKED = unique teachers who clicked (per user rule 2026-08-07)
  const clickedRow = await d1First(`
    SELECT COUNT(*) AS c FROM TeacherInvitation WHERE clickCount > 0
  `);
  stats.CLICKED = clickedRow?.c || 0;

  // Total click events
  const totalRow = await d1First(`
    SELECT COALESCE(SUM(clickCount), 0) AS s FROM TeacherInvitation
  `);
  const totalClickEvents = totalRow?.s || 0;

  return (
    <InvitationsClient
      initialInvitations={invitations as any}
      initialStats={stats}
      totalClickEvents={totalClickEvents}
    />
  );
}

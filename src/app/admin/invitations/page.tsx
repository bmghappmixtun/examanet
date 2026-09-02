// @ts-nocheck
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import InvitationsClient from '@/components/admin/InvitationsClient';
import { expireStaleInvitations } from '@/lib/invitation';

export const dynamic = 'force-dynamic';

export default async function AdminInvitationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  // Auto-expire stale invitations on page load
  await expireStaleInvitations();

  // Fetch all invitations (limit 200 for initial view)
  const [invitations, stats, clickedCount, totalClicks] = await Promise.all([
    prisma.teacherInvitation.findMany({
      take: 200,
      orderBy: { createdAt: 'desc' },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            _count: { select: { uploadedFiles: true } },
          },
        },
        invitedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.teacherInvitation.groupBy({
      by: ['status'],
      _count: { status: true },
    }),
    // Per user rule (2026-08-07): count invitations where the teacher clicked
    // the link at least once — even if they later activated (status moved to
    // ACTIVATED). The old `stats.CLICKED` only counted invitations CURRENTLY
    // in the CLICKED state, which was always 0 because any teacher who
    // clicked eventually activated and moved to ACTIVATED. The chip
    // "Lien cliqué" should show "unique teachers who clicked", not
    // "teachers stuck in CLICKED state".
    prisma.teacherInvitation.count({
      where: { clickCount: { gt: 0 } },
    }),
    // Total click events across all invitations (for the badge tooltip)
    prisma.teacherInvitation.aggregate({
      _sum: { clickCount: true },
    }),
  ]);

  const statsMap: Record<string, number> = {
    PENDING: 0,
    SENT: 0,
    CLICKED: clickedCount, // Override: unique teachers who clicked
    ACTIVATED: 0,
    EXPIRED: 0,
    CANCELLED: 0,
  };
  stats.forEach((s: any) => {
    if (s.status === 'CLICKED') {
      // Don't overwrite our override — we want the unique-click count
      return;
    }
    statsMap[s.status] = s._count.status;
  });

  return (
    <InvitationsClient
      initialInvitations={invitations as any}
      initialStats={statsMap}
      totalClickEvents={totalClicks._sum.clickCount || 0}
    />
  );
}

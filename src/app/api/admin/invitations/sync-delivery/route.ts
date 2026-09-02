// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { syncInvitationDeliveryStatus } from '@/lib/invitation';

export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me || me.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const invitationId = body?.invitationId;

    // If invitationId provided, sync just one
    if (invitationId) {
      const result = await syncInvitationDeliveryStatus(invitationId);
      return NextResponse.json(result);
    }

    // Otherwise sync all SENT invitations from the last 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const invitations = await prisma.teacherInvitation.findMany({
      where: {
        resendMessageId: { not: null },
        OR: [
          { deliveryStatus: null },
          { deliveryStatus: { in: ['sent', 'delivered'] } },
          { deliverySyncedAt: { lt: cutoff } },
        ],
      },
      select: { id: true, email: true, resendMessageId: true, deliveryStatus: true },
      take: 50, // Limit per batch to avoid rate limits
    });

    const results: Array<{ id: string; email: string; status?: string; error?: string }> = [];
    for (const inv of invitations) {
      const result = await syncInvitationDeliveryStatus(inv.id);
      results.push({
        id: inv.id,
        email: inv.email,
        status: result.status,
        error: result.error,
      });
    }

    return NextResponse.json({
      synced: results.length,
      results,
    });
  } catch (e: any) {
    console.error('sync-delivery error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

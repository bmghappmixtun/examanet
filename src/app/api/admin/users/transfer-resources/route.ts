// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/d1-admin';

export const runtime = 'nodejs';

/**
 * POST /api/admin/users/transfer-resources
 * Body: { fromUserId?: string, fromUserEmail?: string, toUserId: string }
 * Transfers all resources from one user to another.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { fromUserId, fromUserEmail, toUserId } = body;

    if (!toUserId) {
      return NextResponse.json({ error: 'toUserId requis' }, { status: 400 });
    }

    // Resolve from user
    let fromId = fromUserId;
    if (!fromId && fromUserEmail) {
      const fromUser = await db.user.findUnique({ where: { email: fromUserEmail } });
      if (!fromUser)
        return NextResponse.json({ error: 'Utilisateur source non trouvé' }, { status: 404 });
      fromId = fromUser.id;
    }
    if (!fromId) {
      return NextResponse.json({ error: 'fromUserId ou fromUserEmail requis' }, { status: 400 });
    }

    // Verify target exists and is a teacher
    const toUser = await db.user.findUnique({ where: { id: toUserId } });
    if (!toUser)
      return NextResponse.json({ error: 'Utilisateur cible non trouvé' }, { status: 404 });
    if (toUser.role !== 'TEACHER' && toUser.role !== 'ADMIN') {
      return NextResponse.json(
        { error: "L'utilisateur cible doit être prof ou admin" },
        { status: 400 },
      );
    }

    // Get count before
    const beforeCount = await db.resource.count({
      where: { teacherId: fromId },
    });

    // Transfer
    const result = await db.resource.updateMany({
      where: { teacherId: fromId },
      data: { teacherId: toUserId },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      fromUser: fromId,
      toUser: toUserId,
      toUserName: `${toUser.firstName || ''} ${toUser.lastName || ''}`.trim(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { createInvitation, sendInvitationEmail } from '@/lib/invitation';

export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me || me.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const teacherIds: string[] = Array.isArray(body?.teacherIds) ? body.teacherIds : [];
    const customMessage: string | undefined = body?.customMessage?.trim() || undefined;

    if (teacherIds.length === 0) {
      return NextResponse.json({ error: 'Aucun professeur sélectionné' }, { status: 400 });
    }
    if (teacherIds.length > 200) {
      return NextResponse.json({ error: 'Maximum 200 profs par batch' }, { status: 400 });
    }

    // Validate: only teachers with real emails
    const teachers = await prisma.user.findMany({
      where: {
        id: { in: teacherIds },
        role: 'TEACHER',
        email: { not: { contains: 'examanet-import.local' } },
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (teachers.length === 0) {
      return NextResponse.json({ error: 'Aucun professeur valide' }, { status: 400 });
    }

    const results: Array<{
      teacherId: string;
      teacherName: string;
      email: string;
      ok: boolean;
      error?: string;
      invitationId?: string;
    }> = [];

    for (const teacher of teachers) {
      try {
        // Skip if already has an active (non-expired) invitation
        const existingActive = await prisma.teacherInvitation.findFirst({
          where: {
            teacherId: teacher.id,
            status: { in: ['PENDING', 'SENT', 'CLICKED'] },
            expiresAt: { gt: new Date() },
          },
        });
        if (existingActive) {
          results.push({
            teacherId: teacher.id,
            teacherName: `${teacher.firstName} ${teacher.lastName}`,
            email: teacher.email,
            ok: false,
            error: 'Invitation déjà active',
          });
          continue;
        }

        const { invitation, tempPassword } = await createInvitation(
          teacher.id,
          me.id,
          customMessage,
        );
        const sendResult = await sendInvitationEmail(invitation.id, tempPassword);

        // Fetch back the temp password from the invitation record (we need it for sendEmail)
        // Actually createInvitation returns it; let me re-check
        // It's returned in the createInvitation function — let me fix
        results.push({
          teacherId: teacher.id,
          teacherName: `${teacher.firstName} ${teacher.lastName}`,
          email: teacher.email,
          ok: sendResult.ok,
          error: sendResult.error,
          invitationId: invitation.id,
        });
      } catch (e: any) {
        results.push({
          teacherId: teacher.id,
          teacherName: `${teacher.firstName} ${teacher.lastName}`,
          email: teacher.email,
          ok: false,
          error: e?.message || 'Erreur inconnue',
        });
      }
    }

    const success = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      success,
      failed,
      total: teachers.length,
      results,
    });
  } catch (e: any) {
    console.error('invite-teacher error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

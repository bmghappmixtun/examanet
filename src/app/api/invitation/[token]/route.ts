// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordInvitationClick, INV_STATUS } from '@/lib/invitation';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      undefined;
    const ua = req.headers.get('user-agent') || undefined;

    const inv = await recordInvitationClick(token, ip, ua);
    if (!inv) {
      return NextResponse.json({ valid: false, notFound: true }, { status: 404 });
    }

    const teacher = await prisma.user.findUnique({
      where: { id: inv.teacherId },
      select: { firstName: true, lastName: true, email: true },
    });

    const fileCount = await prisma.resource.count({
      where: { teacherId: inv.teacherId, status: 'PUBLISHED' },
    });

    return NextResponse.json({
      valid: inv.status !== INV_STATUS.EXPIRED && inv.status !== INV_STATUS.CANCELLED,
      teacherName: teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() : '',
      teacherEmail: teacher?.email || inv.email,
      fileCount,
      status: inv.status,
      expiresAt: inv.expiresAt,
      alreadyActivated: inv.status === INV_STATUS.ACTIVATED,
      expired: inv.status === INV_STATUS.EXPIRED || new Date() > inv.expiresAt,
      cancelled: inv.status === INV_STATUS.CANCELLED,
    });
  } catch (e: any) {
    console.error('invitation GET error:', e);
    return NextResponse.json({ valid: false, error: e.message }, { status: 500 });
  }
}

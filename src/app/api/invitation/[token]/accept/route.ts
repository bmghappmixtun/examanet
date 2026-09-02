// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { activateInvitation } from '@/lib/invitation';
import { createSession, setSessionCookie } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await req.json();
    const password = body?.password;

    if (!password) {
      return NextResponse.json({ success: false, error: 'Mot de passe requis' }, { status: 400 });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      undefined;
    const ua = req.headers.get('user-agent') || undefined;

    const result = await activateInvitation(token, password, ip, ua);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // Fetch the user to create a session
    const inv = await prisma.teacherInvitation.findUnique({ where: { token } });
    if (!inv) {
      return NextResponse.json(
        { success: false, error: 'Erreur post-activation' },
        { status: 500 },
      );
    }

    const user = await prisma.user.findUnique({ where: { id: inv.teacherId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Utilisateur introuvable' },
        { status: 500 },
      );
    }

    // Create session + cookie
    const { token: sessionToken, expiresAt } = await createSession(user.id, ua, ip);
    await setSessionCookie(sessionToken, expiresAt);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (e: any) {
    console.error('accept invitation error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

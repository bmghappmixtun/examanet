import { NextRequest, NextResponse } from 'next/server';
import { recordInvitationClick } from '@/lib/invitation';

// Silent tracking endpoint — called by the client on page load
// (recordInvitationClick is already called in the main GET endpoint, but this is for SPA navigation)
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      undefined;
    const ua = req.headers.get('user-agent') || undefined;
    await recordInvitationClick(token, ip, ua);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false }, { status: 200 }); // Silent fail
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { notInProductionResponse } from '@/lib/security';
import { sendOTPEmail, sendTeacherApprovalEmail, sendResourceApprovedEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // SECURITY: Block in production
  const blocked = notInProductionResponse();
  if (blocked) return blocked;

  // Safety check: require a test token
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email, type = 'otp' } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });

  try {
    if (type === 'otp') {
      await sendOTPEmail(email, '123456', 'Test');
    } else if (type === 'teacher-approved') {
      await sendTeacherApprovalEmail(email, 'Ahmed', true);
    } else if (type === 'teacher-rejected') {
      await sendTeacherApprovalEmail(email, 'Ahmed', false);
    } else if (type === 'resource-approved') {
      await sendResourceApprovedEmail(email, 'Ahmed', 'Devoir de Mathématiques Bac 2024', true);
    }
    return NextResponse.json({
      success: true,
      message: `Email de type "${type}" envoyé à ${email}`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

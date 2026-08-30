// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run, genId } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  const invitations = await d1All(
    `SELECT id, email, status, message, expiresAt, acceptedAt, invitationSentAt,
            invitationActivatedAt, createdAt
     FROM TeacherInvitation
     ORDER BY createdAt DESC LIMIT 200`,
  );
  return NextResponse.json({ invitations });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { email, message } = body;
    if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    const existing = await d1First(
      "SELECT id FROM TeacherInvitation WHERE email = ? AND status IN ('PENDING', 'ACCEPTED')",
      email.toLowerCase(),
    );
    if (existing) {
      return NextResponse.json({ error: 'Une invitation existe déjà pour cet email' }, { status: 400 });
    }
    const id = genId();
    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000; // 14 days
    const r = await d1Run(
      `INSERT INTO TeacherInvitation (id, email, token, invitedById, status, message, expiresAt, invitationSentAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, email.toLowerCase(), token, user.id, 'PENDING', message || null, expiresAt, now, now,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ success: true, id, token });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

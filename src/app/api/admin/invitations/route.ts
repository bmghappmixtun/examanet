// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run, getD1, genId } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';
import { sendInvitationEmail, INV_STATUS } from '@/lib/invitation';
import { createInvitation } from '@/lib/invitation';

/**
 * GET /api/admin/invitations
 * Returns: { invitations, stats, totalClickEvents }
 * - invitations: array of Invitation (with teacher + invitedBy joined)
 * - stats: { PENDING, SENT, CLICKED, ACTIVATED, EXPIRED, CANCELLED }
 * - totalClickEvents: SUM(clickCount) across all invitations
 *
 * Field mapping (DB → client type):
 *   acceptedAt           → activatedAt
 *   invitationSentAt     → emailSentAt
 *   clickCount, etc.     → kept as-is
 *
 * Fields not in D1 (always null on this version):
 *   linkClickedAt, cancelledAt, clickIpAddress, deliveryDetail,
 *   openedAt, openCount
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  // Fetch invitations with teacher + invitedBy joined
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

  // Map rows to Invitation shape
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
  const baseStats: Record<string, number> = {
    PENDING: 0,
    SENT: 0,
    CLICKED: 0,
    ACTIVATED: 0,
    EXPIRED: 0,
    CANCELLED: 0,
  };
  for (const r of statusRows) {
    if (r.status in baseStats) baseStats[r.status] = r.c;
  }

  // CLICKED = "unique teachers who clicked" (per user rule 2026-08-07)
  // Any teacher who clicked eventually activated, so CLICKED status count is always 0
  const clickedRow = await d1First(`
    SELECT COUNT(*) AS c FROM TeacherInvitation WHERE clickCount > 0
  `);
  const clickedCount = clickedRow?.c || 0;

  const totalRow = await d1First(`
    SELECT COALESCE(SUM(clickCount), 0) AS s FROM TeacherInvitation
  `);

  const stats = {
    ...baseStats,
    CLICKED: clickedCount, // override
  };

  return NextResponse.json({
    invitations,
    stats,
    totalClickEvents: totalRow?.s || 0,
  });
}

/**
 * POST /api/admin/invitations
 * Body: { email, firstName?, lastName?, message? }
 * Creates a User (PENDING_INVITATION) + TeacherInvitation (PENDING) + sends email.
 */
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
    const { email, firstName, lastName, message } = body;
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }
    const normalizedEmail = email.toLowerCase().trim();

    // Reject if an active (PENDING/ACTIVATED) invitation exists
    const existing = await d1First(
      "SELECT id, status FROM TeacherInvitation WHERE email = ? AND status IN ('PENDING', 'SENT', 'CLICKED', 'ACTIVATED')",
      normalizedEmail,
    );
    if (existing) {
      return NextResponse.json(
        { error: `Une invitation ${existing.status} existe déjà pour cet email` },
        { status: 400 },
      );
    }

    // Reject if a User with that email already exists with TEACHER/ADMIN role
    const existingUser = await d1First(
      "SELECT id, role FROM \"User\" WHERE email = ? AND role IN ('TEACHER', 'ADMIN')",
      normalizedEmail,
    );
    if (existingUser) {
      return NextResponse.json(
        { error: `Un compte ${existingUser.role} existe déjà pour cet email` },
        { status: 400 },
      );
    }

    // 1. Create User (PENDING_INVITATION, no password yet)
    const userId = genId();
    const now = Date.now();
    const { getNextUserNumericId } = await import('@/lib/db-d1');
    const numericId = await getNextUserNumericId();
    const r1 = await d1Run(
      `INSERT INTO "User" (id, email, role, status, invitationStatus, firstName, lastName, numericId, createdAt, updatedAt, mustChangePassword)
       VALUES (?, ?, 'TEACHER', 'PENDING_INVITATION', 'PENDING_INVITATION', ?, ?, ?, ?, ?, 1)`,
      userId, normalizedEmail, firstName || null, lastName || null, numericId, now, now,
    );
    if (!r1.success) {
      return NextResponse.json({ error: `Création user échouée: ${r1.error}` }, { status: 500 });
    }

    // 2. Use the canonical createInvitation helper (creates TeacherInvitation,
    //    sets temp password, locks user, sends email).
    try {
      const { invitation, tempPassword } = await createInvitation(
        userId,
        user.id,
        message || null,
      );
      // 3. Send invitation email
      const send = await sendInvitationEmail(invitation.id, tempPassword);
      return NextResponse.json({
        success: true,
        id: invitation.id,
        userId,
        emailSent: send.ok,
        emailError: send.error,
      });
    } catch (e: any) {
      // Roll back user creation if invitation failed
      await d1Run('DELETE FROM "User" WHERE id = ?', userId);
      return NextResponse.json(
        { error: `Création invitation échouée: ${e.message}` },
        { status: 500 },
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

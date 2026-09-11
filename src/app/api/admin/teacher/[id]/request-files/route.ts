// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run, genId } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

/**
 * POST /api/admin/teacher/[id]/request-files — D1 direct
 *
 * For NEW (non-invited) teachers, ask them to send 5 sample files
 * to verify they're a real teacher. Invited teachers are excluded.
 *
 * Note: email sending is skipped (CF Workers can't send email directly).
 * The client should trigger email via /api/email/teacher-file-request.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const note: string | null = (body?.note || '').toString().trim() || null;

  const teacher = await d1First(
    `SELECT id, email, firstName, lastName, status, role,
            lastInvitationId, verificationFilesRequestedAt
     FROM User WHERE id = ?`,
    id,
  );
  if (!teacher || teacher.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Enseignant non trouvé' }, { status: 404 });
  }

  // Exclude invited teachers
  if (teacher.lastInvitationId) {
    return NextResponse.json(
      {
        error: 'Action non applicable : cet enseignant a été invité. Les profs invités sont déjà pré-vérifiés.',
        code: 'INVITED_TEACHER',
      },
      { status: 400 },
    );
  }
  // Avoid duplicate requests within 24h
  if (teacher.verificationFilesRequestedAt) {
    const hoursSince = (Date.now() - Number(teacher.verificationFilesRequestedAt)) / 1000 / 3600;
    if (hoursSince < 24) {
      return NextResponse.json(
        {
          error: `Une demande a déjà été envoyée il y a ${Math.floor(hoursSince)}h. Réessayez après 24h.`,
          code: 'ALREADY_REQUESTED',
        },
        { status: 400 },
      );
    }
  }
  if (!teacher.email || !teacher.firstName || !teacher.lastName) {
    return NextResponse.json({ error: 'Profil prof incomplet (email/nom manquant)' }, { status: 400 });
  }
  // Update User
  const now = Date.now();
  const r = await d1Run(
    `UPDATE User SET status = 'PENDING_FILE_VERIFICATION',
            verificationFilesRequestedAt = ?, updatedAt = ?
     WHERE id = ?`,
    now, now, id,
  );
  if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
  // Create in-app notification (D1 Notification table may not exist, but we try)
  try {
    await d1Run(
      `INSERT INTO Notification (id, userId, type, title, body, link, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      genId(), id, 'verification_files_requested',
      '📁 Action requise : envoyez 5 fichiers de vérification',
      `Bonjour ${teacher.firstName}, pour finaliser la vérification de votre compte enseignant, merci de nous envoyer 5 fichiers Word/PDF d'exemple (cours, séries, devoirs, etc.) avec votre nom et prénom. Vous avez 7 jours.`,
      '/enseignant/verification', now,
    );
  } catch {}
  return NextResponse.json({
    success: true,
    emailSent: false,
    message: `Demande préparée pour ${teacher.firstName} ${teacher.lastName}. L'envoi d'email n'est pas encore actif sur CF Workers — l'admin doit contacter le prof manuellement.`,
  });
}

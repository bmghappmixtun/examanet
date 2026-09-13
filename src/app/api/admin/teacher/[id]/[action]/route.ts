// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run, genId } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';
import { invalidateCache } from '@/lib/kv-cache';
import { sendTeacherFileRequestEmail } from '@/lib/email';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const { id, action } = await params;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  }
  const teacher: any = await d1First(
    'SELECT id, role, status, email, firstName, lastName, lastInvitationId FROM User WHERE id = ?',
    id,
  );
  if (!teacher || teacher.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Enseignant non trouvé' }, { status: 404 });
  }
  let body: { reason?: string } = {};
  try { body = await req.json(); } catch {}

  if (action === 'approve') {
    const now = Date.now();
    const isInvited = !!teacher.lastInvitationId;

    if (isInvited) {
      // Invited teachers are pre-verified by the invitation process.
      // Skip file verification, go directly to ACTIVE + verified.
      const r = await d1Run(
        `UPDATE User SET status = 'ACTIVE', isVerifiedTeacher = 1,
                approvedAt = ?, approvedById = ?, updatedAt = ?
         WHERE id = ?`,
        now, user.id, now, id,
      );
      if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
      await invalidateCache('user-counts-v1');
      // 2026-09-13: Track final approval on journey
      const { trackJourney } = await import('@/lib/teacher-journey');
      await trackJourney(id, 'VERIFICATION_APPROVED', {
        page: '/admin/verifications',
        metadata: { adminId: user.id, invited: true },
        req,
      });
      return NextResponse.json({
        success: true,
        status: 'ACTIVE',
        verified: true,
        message: 'Enseignant invité approuvé et marqué comme vérifié.',
      });
    }

    // 2026-09-11: New flow for self-registered teachers:
    // Approve does NOT mark as verified yet. First, ask for 5 verification files.
    // The teacher becomes VERIFIED only after admin reviews the files (Step 5).
    const r = await d1Run(
      `UPDATE User SET status = 'PENDING_FILE_VERIFICATION',
              verificationFilesRequestedAt = ?, approvedAt = ?, approvedById = ?,
              isVerifiedTeacher = 0, updatedAt = ?
       WHERE id = ?`,
      now, now, user.id, now, id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });

    // In-app notification
    try {
      await d1Run(
        `INSERT INTO Notification (id, userId, type, title, body, link, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        genId(), id, 'verification_files_requested',
        '📁 Bienvenue ! Envoyez 5 fichiers de vérification',
        `Bonjour ${teacher.firstName || ''}, votre compte enseignant vient d'être approuvé. Pour finaliser la vérification et obtenir le badge "Enseignant Vérifié", merci d'envoyer 5 fichiers Word ou PDF d'exemple (cours, séries d'exercices, devoirs) avec votre nom et prénom. Vous avez 7 jours.`,
        '/enseignant/verification', now,
      );
    } catch (e) {
      console.error('[approve] notification error:', e);
    }

    // Email the teacher
    let emailSent = false;
    if (teacher.email) {
      try {
        const emailResult = await sendTeacherFileRequestEmail({
          to: teacher.email,
          firstName: teacher.firstName || '',
          lastName: teacher.lastName || '',
          email: teacher.email,
          note: 'Bienvenue ! Votre compte enseignant a été approuvé. Pour finaliser la vérification, merci d\'envoyer 5 fichiers.',
        });
        emailSent = emailResult.success;
        if (!emailResult.success) {
          console.error('[approve] teacher email failed:', emailResult.error);
        }
      } catch (e) {
        console.error('[approve] teacher email error:', e);
      }
    }

    await invalidateCache('user-counts-v1');
    return NextResponse.json({
      success: true,
      status: 'PENDING_FILE_VERIFICATION',
      verified: false,
      nextStep: 'file_verification',
      emailSent,
      message: emailSent
        ? `Enseignant approuvé. Email envoyé pour demander 5 fichiers de vérification.`
        : `Enseignant approuvé. Demande de fichiers créée (email non envoyé — vérifier Resend).`,
    });
  } else {
    // reject
    const r = await d1Run(
      "UPDATE User SET status = 'REJECTED', updatedAt = ? WHERE id = ?",
      Date.now(), id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    await invalidateCache('user-counts-v1');
    return NextResponse.json({ success: true, status: 'REJECTED' });
  }
}

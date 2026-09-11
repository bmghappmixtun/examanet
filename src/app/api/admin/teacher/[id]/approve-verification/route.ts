// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run, genId } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';
import { invalidateCache } from '@/lib/kv-cache';
import { sendTeacherVerifiedEmail } from '@/lib/email';

/**
 * POST /api/admin/teacher/[id]/approve-verification
 *
 * 2026-09-11: After teacher uploads 5 verification files, admin reviews them.
 * Approve: status ACTIVE + isVerifiedTeacher=1 + email + badge
 * Reject: status PENDING_FILE_VERIFICATION + ask for resubmission
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { action, reason } = body as { action?: 'approve' | 'reject'; reason?: string };

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action requise: approve ou reject' }, { status: 400 });
  }

  const teacher: any = await d1First(
    'SELECT id, email, firstName, lastName, role, status FROM User WHERE id = ?',
    id,
  );
  if (!teacher || teacher.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Enseignant non trouvé' }, { status: 404 });
  }

  const now = Date.now();

  if (action === 'approve') {
    const files: any = await d1First(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN reviewedByAdmin = 1 THEN 1 ELSE 0 END) as reviewed,
              SUM(CASE WHEN reviewedByAdmin = 1 AND reviewNote IS NOT NULL THEN 1 ELSE 0 END) as rejected
       FROM TeacherVerificationFile WHERE userId = ?`,
      id,
    );

    if (!files?.total || files.total < 1) {
      return NextResponse.json(
        { error: 'Aucun fichier de vérification uploadé.' },
        { status: 400 },
      );
    }

    const r = await d1Run(
      `UPDATE User SET status = 'ACTIVE',
              isVerifiedTeacher = 1,
              verifiedAt = ?,
              updatedAt = ?
       WHERE id = ?`,
      now, now, id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });

    try {
      await d1Run(
        `INSERT INTO Notification (id, userId, type, title, body, link, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        genId(), id, 'teacher_verified',
        '🎉 Félicitations, vous êtes désormais un Enseignant Vérifié !',
        `Bonjour ${teacher.firstName || ''}, votre compte a été vérifié avec succès. Vous pouvez désormais publier des ressources en toute confiance. Le badge "Vérifié" est maintenant visible sur votre profil.`,
        '/enseignant', now,
      );
    } catch (e) {
      console.error('[approve-verification] notification error:', e);
    }

    let emailSent = false;
    if (teacher.email) {
      try {
        const emailResult = await sendTeacherVerifiedEmail({
          to: teacher.email,
          firstName: teacher.firstName || '',
          lastName: teacher.lastName || '',
        });
        emailSent = emailResult.success;
        if (!emailResult.success) {
          console.error('[approve-verification] teacher email failed:', emailResult.error);
        }
      } catch (e) {
        console.error('[approve-verification] teacher email error:', e);
      }
    }

    await invalidateCache('user-counts-v1');
    return NextResponse.json({
      success: true,
      status: 'ACTIVE',
      verified: true,
      emailSent,
      message: emailSent
        ? `Enseignant marqué comme vérifié. Email de félicitations envoyé.`
        : `Enseignant marqué comme vérifié (email non envoyé).`,
    });
  } else {
    const r = await d1Run(
      `UPDATE User SET status = 'PENDING_FILE_VERIFICATION',
              verificationFilesRequestedAt = ?,
              isVerifiedTeacher = 0,
              updatedAt = ?
       WHERE id = ?`,
      now, now, id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });

    try {
      await d1Run(
        `INSERT INTO Notification (id, userId, type, title, body, link, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        genId(), id, 'verification_rejected',
        '⚠️ Fichiers de vérification rejetés',
        reason
          ? `Bonjour ${teacher.firstName || ''}, vos fichiers de vérification ont été rejetés. Motif : ${reason}. Merci de renvoyer 5 nouveaux fichiers.`
          : `Bonjour ${teacher.firstName || ''}, vos fichiers de vérification ont été rejetés. Merci de renvoyer 5 nouveaux fichiers.`,
        '/enseignant/verification', now,
      );
    } catch (e) {
      console.error('[approve-verification] reject notification error:', e);
    }

    await invalidateCache('user-counts-v1');
    return NextResponse.json({
      success: true,
      status: 'PENDING_FILE_VERIFICATION',
      verified: false,
      message: 'Fichiers rejetés. Le prof doit renvoyer.',
    });
  }
}

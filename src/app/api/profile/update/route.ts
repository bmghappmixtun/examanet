// @ts-nocheck
/**
 * PATCH /api/profile/update
 *
 * 2026-09-09: Update current user's profile (used after OAuth signup
 * to complete missing fields like school/class/governorate).
 *
 * 2026-09-11: Auto-trigger 5-file verification request for TEACHERs
 * who just completed their profile after OTP. This removes the manual
 * admin approval step for self-registered teachers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction, getClientIp } from '@/lib/security';
import { getCurrentUser, isTeacherProfileComplete } from '@/lib/auth';
import { sendTeacherFileRequestEmail } from '@/lib/email';
import { genId } from '@/lib/db-d1';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function PATCH(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const allowedFields = ['firstName', 'lastName', 'schoolLevel', 'classLevel', 'schoolName', 'governorate'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
        // Basic validation
        const v = String(body[field]).trim().slice(0, 200);
        if (!v) continue;
        updates.push(`${field} = ?`);
        values.push(v);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
    }

    const db = await getD1();
    const now = Date.now();
    updates.push('updatedAt = ?');
    values.push(now);
    values.push(user.id);

    await db.prepare(
      `UPDATE User SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    // 2026-09-11: For TEACHERs who just completed their profile after OTP,
    // auto-trigger the 5-file verification request.
    // Conditions:
    // - role = TEACHER
    // - status = PENDING_APPROVAL (just verified email, never approved by admin)
    // - profile is now complete (all required fields filled)
    let nextStep: string | null = null;
    let emailSent = false;

    if (user.role === 'TEACHER' && user.status === 'PENDING_APPROVAL') {
      // Re-fetch user to get the just-updated fields
      const updated: any = await db
        .prepare(
          `SELECT firstName, lastName, schoolName, governorate, email, status
           FROM User WHERE id = ?`,
        )
        .bind(user.id)
        .first();

      if (updated && isTeacherProfileComplete(updated)) {
        // Profile just completed → auto-trigger file verification
        await db
          .prepare(
            `UPDATE User SET status = 'PENDING_FILE_VERIFICATION',
                    verificationFilesRequestedAt = ?,
                    updatedAt = ?
             WHERE id = ?`,
          )
          .bind(now, now, user.id)
          .run();

        // In-app notification
        try {
          await db
            .prepare(
              `INSERT INTO Notification (id, userId, type, title, message, link, createdAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              genId(),
              user.id,
              'verification_files_requested',
              '📁 Bienvenue ! Envoyez 5 fichiers de vérification',
              `Bonjour ${updated.firstName || ''}, votre profil est complet ! Pour finaliser la vérification de votre compte enseignant et obtenir le badge "Vérifié", merci d'envoyer 5 fichiers Word ou PDF d'exemple (cours, séries d'exercices, devoirs) avec votre nom et prénom. Vous avez 7 jours.`,
              '/enseignant/verification',
              now,
            )
            .run();
        } catch (e) {
          console.error('[profile/update] notification error:', e);
        }

        // Email
        if (updated.email) {
          try {
            const emailResult = await sendTeacherFileRequestEmail({
              to: updated.email,
              firstName: updated.firstName || '',
              lastName: updated.lastName || '',
              email: updated.email,
              note: 'Bienvenue ! Votre profil est complet. Pour finaliser la vérification, merci d\'envoyer 5 fichiers (Word ou PDF) avec votre nom et prénom.',
            });
            emailSent = emailResult.success;
            if (!emailResult.success) {
              console.error('[profile/update] teacher email failed:', emailResult.error);
            }
          } catch (e) {
            console.error('[profile/update] teacher email error:', e);
          }
        }

        nextStep = 'file_verification';
      }
    }

    return NextResponse.json({
      success: true,
      nextStep,
      emailSent,
    });
  } catch (e: any) {
    console.error('[profile/update] error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

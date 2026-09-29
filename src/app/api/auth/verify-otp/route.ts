// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { createSession, setSessionCookie } from '@/lib/auth';
import { sendWelcomeConfirmedEmail } from '@/lib/email';
import { notifyAdminsTeacherActivated, notifyAdminsStudentActivated } from '@/lib/admin-notify';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ error: 'Email et code requis' }, { status: 400 });
    }

    const db = await getD1();
    const normalizedEmail = email.toLowerCase();

    const user = await db
      .prepare('SELECT id, status, emailVerifiedAt, email, firstName, lastName, role FROM User WHERE email = ? LIMIT 1')
      .bind(normalizedEmail)
      .first();
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    // Already verified?
    if (user.emailVerifiedAt) {
      if (user.status === 'ACTIVE') {
        const { token, expiresAt } = await createSession(user.id);
        await setSessionCookie(token, expiresAt);
        return NextResponse.json({ success: true, status: 'ACTIVE', autoLoggedIn: true });
      }
      return NextResponse.json({ success: true, status: user.status });
    }

    // Find the most recent unused OTP for this user
    const otp = await db
      .prepare(
        `SELECT id, code, expiresAt FROM OtpCode
         WHERE userId = ? AND purpose = 'VERIFY' AND usedAt IS NULL
         ORDER BY createdAt DESC LIMIT 1`,
      )
      .bind(user.id)
      .first();

    if (!otp) {
      return NextResponse.json(
        { error: 'Aucun code en attente. Demandez un nouveau code.' },
        { status: 400 },
      );
    }
    if (Number(otp.expiresAt) < Date.now()) {
      return NextResponse.json(
        { error: 'Code expiré. Demandez un nouveau code.' },
        { status: 400 },
      );
    }
    if (otp.code !== code) {
      return NextResponse.json({ error: 'Code incorrect' }, { status: 400 });
    }

    // Mark OTP as used
    await db
      .prepare('UPDATE OtpCode SET usedAt = ? WHERE id = ?')
      .bind(Date.now(), otp.id)
      .run();

    // Update user: verify email + set status
    const newStatus = user.role === 'TEACHER' ? 'PENDING_APPROVAL' : 'ACTIVE';
    const now = Date.now();
    await db
      .prepare(
        'UPDATE User SET status = ?, emailVerifiedAt = ?, updatedAt = ? WHERE id = ?',
      )
      .bind(newStatus, now, now, user.id)
      .run();

    // Send confirmation email
    await sendWelcomeConfirmedEmail(user.email, user.firstName ?? '', user.role).catch(
      (e) => console.error('Confirmation email error:', e),
    );

    // Auto-login students; teachers wait for approval
    if (newStatus === 'ACTIVE') {
      const { token, expiresAt } = await createSession(user.id);
      await setSessionCookie(token, expiresAt);
      // 2026-09-09: Notify admin (in-app + email) about student activation
      await notifyAdminsStudentActivated(user.id).catch((e) =>
        console.error('Admin notify error:', e),
      );
      return NextResponse.json({ success: true, status: 'ACTIVE', autoLoggedIn: true });
    }

    // 2026-09-11: Auto-login teacher too (was: had to re-login manually)
    // Teacher is still PENDING_APPROVAL but now has a session to navigate
    if (user.role === 'TEACHER') {
      const { token, expiresAt } = await createSession(user.id);
      await setSessionCookie(token, expiresAt);
      await notifyAdminsTeacherActivated(user.id).catch((e) =>
        console.error('Admin notify error:', e),
      );

      // 2026-09-29: Skip profile completion step — go straight to verification files.
      // Set status directly to PENDING_FILE_VERIFICATION + request files now.
      const now = Date.now();
      try {
        await db
          .prepare(
            `UPDATE User
             SET status = 'PENDING_FILE_VERIFICATION',
                 verificationFilesRequestedAt = ?,
                 updatedAt = ?
             WHERE id = ?`,
          )
          .bind(now, now, user.id)
          .run();

        // In-app notification (best-effort)
        const { genId } = await import('@/lib/db-d1');
        await db
          .prepare(
            `INSERT INTO Notification (id, userId, type, title, body, link, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            genId(),
            user.id,
            'verification_files_requested',
            '📁 Bienvenue ! Envoyez votre fichier de vérification',
            `Bonjour ${user.firstName || ''}, votre email est vérifié ! Pour finaliser la vérification de votre compte enseignant et obtenir le badge "Vérifié", merci d'envoyer 1 fichier Word ou PDF d'exemple de votre travail avec votre nom et prénom.`,
            '/enseignant/verification',
            now,
          )
          .run();
      } catch (e) {
        console.error('[verify-otp] Failed to set PENDING_FILE_VERIFICATION:', e);
        // Don't block the auth flow if the status update fails
      }

      // Send email notification (best-effort)
      try {
        const { sendTeacherFileRequestEmail } = await import('@/lib/email');
        await sendTeacherFileRequestEmail({
          to: user.email,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email,
          note: 'Votre email est vérifié. Pour finaliser la vérification, merci d\'envoyer 1 fichier Word (.docx) ou PDF contenant un exemple de votre travail avec votre nom et prénom.',
        });
      } catch (e) {
        console.error('[verify-otp] sendTeacherFileRequestEmail error:', e);
      }

      // 2026-09-13: Track OTP verification + first login for teacher journey
      const { trackJourney } = await import('@/lib/teacher-journey');
      await trackJourney(user.id, 'SELF_SIGNUP_OTP_VERIFIED', {
        page: '/verify-otp',
        metadata: { autoLoggedIn: true },
        req,
      });
      await trackJourney(user.id, 'FIRST_LOGIN', {
        page: '/verify-otp',
        req,
      });

      // Return autoLoggedIn so client knows to skip the manual login
      return NextResponse.json({
        success: true,
        status: 'PENDING_FILE_VERIFICATION',
        autoLoggedIn: true,
        message: 'Email vérifié ! Envoyez votre fichier de vérification pour devenir Enseignant Vérifié.',
        nextStep: 'file_verification', // 2026-09-29: skip profile, go straight to /enseignant/verification
      });
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (e: any) {
    console.error('Verify OTP error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

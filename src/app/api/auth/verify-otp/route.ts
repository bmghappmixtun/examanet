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
      // Return autoLoggedIn so client knows to skip the manual login
      return NextResponse.json({
        success: true,
        status: 'PENDING_APPROVAL',
        autoLoggedIn: true,
        message: 'Email vérifié ! Votre compte enseignant est en attente d\'approbation.',
        nextStep: 'profile_completion', // tells UI to redirect to /profil/completer
      });
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (e: any) {
    console.error('Verify OTP error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

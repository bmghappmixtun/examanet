// @ts-nocheck
/**
 * POST /api/admin/invite-new-teacher
 *
 * Invite a NEW prof (not yet in the platform) by email + first name + last name + source site.
 * Creates a User record (with PENDING_INVITATION status) + a TeacherInvitation,
 * then sends the dedicated email template.
 *
 * Body:
 *   {
 *     firstName: string
 *     lastName: string
 *     email: string
 *     site: 'devoirat' | 'tunisiecollege'
 *     customMessage?: string
 *   }
 *
 * Response:
 *   { ok: true, invitationId, userId, tempPassword, acceptUrl }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import {
  createInvitation,
  USER_INV_STATUS,
} from '@/lib/invitation';
import { renderJotformInvitationEmail, type SourceSite } from '@/lib/email-templates/jotform-invitation';
import { Resend } from 'resend';

const VALID_SITES: SourceSite[] = ['devoirat', 'tunisiecollege'];

function validateBody(body: any): { ok: true; data: {
  firstName: string;
  lastName: string;
  email: string;
  site: SourceSite;
  customMessage?: string;
} } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' };
  }
  const { firstName, lastName, email, site, customMessage } = body;
  if (typeof firstName !== 'string' || firstName.trim().length === 0 || firstName.length > 100) {
    return { ok: false, error: 'firstName is required (1-100 chars)' };
  }
  if (typeof lastName !== 'string' || lastName.trim().length === 0 || lastName.length > 100) {
    return { ok: false, error: 'lastName is required (1-100 chars)' };
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { ok: false, error: 'email is required and must be valid' };
  }
  if (!VALID_SITES.includes(site)) {
    return { ok: false, error: `site must be one of: ${VALID_SITES.join(', ')}` };
  }
  if (customMessage !== undefined && (typeof customMessage !== 'string' || customMessage.length > 1000)) {
    return { ok: false, error: 'customMessage is optional but must be a string (max 1000 chars)' };
  }
  return {
    ok: true,
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      site,
      customMessage: customMessage?.trim() || undefined,
    },
  };
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'Examanet <noreply@examanet.com>';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

// Subject lines (kept in sync with the email template)
const SITE_CONFIG: Record<SourceSite, { subject: string }> = {
  devoirat: { subject: '🎁 Une plateforme 100% gratuite attend vos ressources — examenet.com' },
  tunisiecollege: { subject: 'Vos ressources méritent d\'être vues — rejoignez examanet.com 🎓' },
};

export async function POST(req: NextRequest) {
  try {
  // Auth: admin only
  const me = await getCurrentUser();
  if (!me || me.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse + validate body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = validateBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { firstName, lastName, email, site, customMessage } = parsed.data;
  const normalizedEmail = email; // already lowercased + trimmed in validateBody

  // Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, role: true, status: true, firstName: true, lastName: true },
  });

  if (user) {
    // Existing user — if not a teacher, convert? For now: error if not a teacher
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: `Cet email appartient déjà à un compte avec le rôle ${user.role}` },
        { status: 400 },
      );
    }
  } else {
    // Create the new user (with PENDING_INVITATION status, no password yet)
    // Slug is required by the User model (even though it's cosmetic / non-unique)
    const baseSlug = `${firstName}-${lastName}`
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80) || 'teacher';
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        firstName,
        lastName,
        slug: baseSlug,
        role: 'TEACHER',
        status: USER_INV_STATUS.PENDING_INVITATION,
        // We don't set a password — the teacher will set it during activation
      },
      select: { id: true, role: true, status: true, firstName: true, lastName: true },
    });
  }

  // Check if there's already a pending (non-expired) invitation
  const existingInv = await prisma.teacherInvitation.findFirst({
    where: {
      teacherId: user.id,
      status: { in: ['PENDING', 'SENT', 'CLICKED'] },
      expiresAt: { gt: new Date() },
    },
  });
  if (existingInv) {
    return NextResponse.json(
      { error: 'Une invitation active existe déjà pour ce prof', invitationId: existingInv.id },
      { status: 400 },
    );
  }

  // Create the invitation (with site in customMessage for now, since we don't have a column)
  const { invitation, tempPassword, token } = await createInvitation(
    user.id,
    me.id,
    customMessage,
  );
  const acceptUrl = `${SITE_URL}/invitation/${token}`;

  // Render the dedicated email template
  const html = renderJotformInvitationEmail({
    firstName,
    site: site as SourceSite,
    acceptUrl,
    unsubscribeUrl: `${SITE_URL}/desinscrire?email=${encodeURIComponent(normalizedEmail)}`,
    customMessage: customMessage || null,
  });

  const subject = SITE_CONFIG[site as SourceSite].subject;

  // Send the email
  let emailOk = false;
  let emailError: string | undefined;
  if (resend) {
    try {
      const result: any = await resend.emails.send({
        from: FROM,
        to: [normalizedEmail],
        subject,
        html,
      });
      if (result.error) {
        emailError = result.error.message;
        console.error('📧 [JOTFORM INVITATION ERROR]', normalizedEmail, '→', result.error.message);
      } else {
        emailOk = true;
        await prisma.teacherInvitation.update({
          where: { id: invitation.id },
          data: { status: 'SENT', emailSentAt: new Date() },
        });
      }
    } catch (e: any) {
      emailError = e.message;
      console.error('📧 [JOTFORM INVITATION EXCEPTION]', e);
    }
  } else {
    // Dev mode: log to console
    console.log(`\n📧 [JOTFORM INVITATION - DEV] To: ${normalizedEmail}`);
    console.log(`   Site: ${site}`);
    console.log(`   Name: ${firstName} ${lastName}`);
    console.log(`   Accept URL: ${acceptUrl}`);
    emailOk = true; // In dev, we consider it OK
  }

  return NextResponse.json({
    ok: true,
    userId: user.id,
    invitationId: invitation.id,
    tempPassword,
    acceptUrl,
    emailSent: emailOk,
    emailError,
  });
  } catch (err: any) {
    console.error('❌ [JOTFORM INVITATION - UNCAUGHT]', err);
    return NextResponse.json(
      {
        error: 'Erreur serveur inattendue',
        details: err?.message || String(err),
        stack: err?.stack?.split('\n').slice(0, 5).join('\n') || null,
      },
      { status: 500 },
    );
  }
}

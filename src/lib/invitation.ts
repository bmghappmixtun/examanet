// @ts-nocheck
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { Resend } from 'resend';
import { notifyAdminsInvitedTeacherActivated } from './admin-notify';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'Examanet <noreply@examanet.com>';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
const INVITATION_TTL_DAYS = 10;

// Status constants
export const INV_STATUS = {
  PENDING: 'PENDING', // Created, email not yet sent
  SENT: 'SENT', // Email sent, link not clicked
  CLICKED: 'CLICKED', // Link clicked, not yet activated
  ACTIVATED: 'ACTIVATED', // Teacher set their own password
  EXPIRED: 'EXPIRED', // Past 10 days without activation
  CANCELLED: 'CANCELLED', // Admin cancelled
} as const;

// User.status for invitations
export const USER_INV_STATUS = {
  PENDING_INVITATION: 'PENDING_INVITATION',
  INVITED: 'INVITED',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  ACTIVATED: 'ACTIVATED',
} as const;

/**
 * Generate a secure URL-safe token for invitation link
 */
export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a unique random 8-char password
 * Uses unambiguous chars (no 0/O/1/l/I), mixed case + digits
 */
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

/**
 * Create an invitation record for a teacher
 */
export async function createInvitation(
  teacherId: string,
  invitedById?: string,
  customMessage?: string,
) {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { id: true, email: true, firstName: true, lastName: true, status: true },
  });
  if (!teacher) throw new Error('Teacher not found');
  if (!teacher.email) throw new Error('Teacher has no email');

  const token = generateInvitationToken();
  const tempPassword = generateTempPassword();
  const tempPasswordHash = await bcrypt.hash(tempPassword, 12);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await prisma.teacherInvitation.create({
    data: {
      teacherId,
      email: teacher.email,
      token,
      tempPassword: tempPasswordHash, // Stored hashed
      expiresAt,
      status: INV_STATUS.PENDING,
      invitedById,
      customMessage,
    },
  });

  // Update User: lock account with new temp password
  await prisma.user.update({
    where: { id: teacherId },
    data: {
      passwordHash: tempPasswordHash,
      invitationStatus: USER_INV_STATUS.PENDING_INVITATION,
      lastInvitationId: invitation.id,
      mustChangePassword: true,
      status: 'PENDING_OTP', // Force activation flow
    },
  });

  return { invitation, tempPassword, token };
}

/**
 * Send invitation email
 */
export async function sendInvitationEmail(
  invitationId: string,
  tempPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const inv = await prisma.teacherInvitation.findUnique({
    where: { id: invitationId },
    include: { teacher: { select: { firstName: true, lastName: true } } },
  });
  if (!inv) return { ok: false, error: 'Invitation not found' };

  const teacherName =
    `${inv.teacher.firstName || ''} ${inv.teacher.lastName || ''}`.trim() || 'Cher enseignant';
  const acceptUrl = `${SITE_URL}/invitation/${inv.token}`;
  const landingUrl = `${SITE_URL}/enseignants/rejoindre`;

  // Count their files
  const fileCount = await prisma.resource.count({
    where: { teacherId: inv.teacherId, status: 'PUBLISHED' },
  });

  const html = renderInvitationEmail({
    teacherName,
    teacherEmail: inv.email,
    acceptUrl,
    landingUrl,
    tempPassword,
    fileCount,
    customMessage: inv.customMessage,
    expiresAt: inv.expiresAt,
  });

  // Smart subject line
  const greeting = computeFirstName(teacherName, inv.email);
  const subject =
    fileCount > 0
      ? `${greeting}, vos ${fileCount} ressources sont prêtes sur Examanet 🎓`
      : `${greeting}, rejoignez Examanet — la plateforme #1 en Tunisie 🎓`;

  if (!resend) {
    console.log(`\n📧 [INVITATION - DEV] To: ${inv.email}`);
    console.log(`   Name: ${teacherName}`);
    console.log(`   Greeting: ${greeting}`);
    console.log(`   Temp password: ${tempPassword}`);
    console.log(`   Accept URL: ${acceptUrl}`);
    console.log(`   Files: ${fileCount}`);
    return { ok: true };
  }

  try {
    // Cast to any: open_tracking/click_tracking exist in Resend API but not in old SDK types
    const result: any = await resend.emails.send({
      from: FROM,
      to: [inv.email],
      subject,
      html,
      // Enable open + click tracking (invisible pixel + link tracking)
      open_tracking: true,
      click_tracking: true,
    } as any);

    if (result.error) {
      console.error('📧 [INVITATION ERROR]', inv.email, '→', result.error.message);
      return { ok: false, error: result.error.message };
    }

    // Resend returns the message ID for later delivery tracking
    const resendMessageId = result.data?.id || null;

    await prisma.teacherInvitation.update({
      where: { id: invitationId },
      data: {
        status: INV_STATUS.SENT,
        emailSentAt: new Date(),
        resendMessageId,
        deliveryStatus: 'sent',
        deliverySyncedAt: new Date(),
      },
    });

    await prisma.user.update({
      where: { id: inv.teacherId },
      data: {
        invitationStatus: USER_INV_STATUS.INVITED,
        invitationSentAt: new Date(),
      },
    });

    return { ok: true };
  } catch (e: any) {
    console.error('📧 [INVITATION THROW]', inv.email, '→', e?.message);
    return { ok: false, error: e?.message };
  }
}

/**
 * Sync delivery status from Resend for a single invitation
 */
export async function syncInvitationDeliveryStatus(invitationId: string): Promise<{
  ok: boolean;
  status?: string;
  opened?: boolean;
  openCount?: number;
  error?: string;
}> {
  if (!resend) {
    return { ok: false, error: 'Resend not configured' };
  }

  const inv = await prisma.teacherInvitation.findUnique({ where: { id: invitationId } });
  if (!inv) return { ok: false, error: 'Invitation not found' };
  if (!inv.resendMessageId) return { ok: false, error: 'No Resend message ID' };

  try {
    const result: any = await resend.emails.get(inv.resendMessageId);
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    const data = result.data;
    const lastEvent = data?.last_event || 'sent';
    // Resend events: sent, delivered, bounced, complained, failed, opened, clicked
    let detail: string | null = null;
    if (data?.bounce) detail = `Bounce: ${data.bounce.message || data.bounce.type || 'unknown'}`;
    if (data?.complaint) detail = `Complaint: ${data.complaint.message || 'unknown'}`;

    // Track opens: last_event="opened" or "clicked" means the email was opened
    const isOpened = lastEvent === 'opened' || lastEvent === 'clicked';
    const openedAt = isOpened && !inv.openedAt ? new Date() : inv.openedAt;
    const openCount = isOpened ? (inv.openCount || 0) + 1 : (inv.openCount || 0);

    await prisma.teacherInvitation.update({
      where: { id: invitationId },
      data: {
        deliveryStatus: lastEvent,
        deliveryDetail: detail,
        deliverySyncedAt: new Date(),
        openedAt,
        openCount,
      },
    });

    return { ok: true, status: lastEvent, opened: isOpened, openCount };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

/**
 * Record a link click
 */
export async function recordInvitationClick(token: string, ipAddress?: string, userAgent?: string) {
  const inv = await prisma.teacherInvitation.findUnique({ where: { token } });
  if (!inv) return null;
  if (
    inv.status === INV_STATUS.ACTIVATED ||
    inv.status === INV_STATUS.EXPIRED ||
    inv.status === INV_STATUS.CANCELLED
  ) {
    return inv;
  }

  // Auto-expire if past expiresAt
  if (new Date() > inv.expiresAt) {
    await prisma.teacherInvitation.update({
      where: { id: inv.id },
      data: { status: INV_STATUS.EXPIRED },
    });
    return { ...inv, status: INV_STATUS.EXPIRED };
  }

  const updates: any = {
    clickCount: { increment: 1 },
  };
  if (!inv.linkClickedAt) {
    updates.status = INV_STATUS.CLICKED;
    updates.linkClickedAt = new Date();
    updates.clickIpAddress = ipAddress;
    updates.clickUserAgent = userAgent;
  }

  return prisma.teacherInvitation.update({
    where: { id: inv.id },
    data: updates,
  });
}

/**
 * Activate an invitation: teacher sets their own password
 */
export async function activateInvitation(
  token: string,
  newPassword: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const inv = await prisma.teacherInvitation.findUnique({ where: { token } });
  if (!inv) return { ok: false, error: 'Invitation introuvable' };
  if (inv.status === INV_STATUS.ACTIVATED)
    return { ok: false, error: 'Cette invitation a déjà été activée' };
  if (inv.status === INV_STATUS.CANCELLED)
    return { ok: false, error: 'Cette invitation a été annulée' };
  if (inv.status === INV_STATUS.EXPIRED)
    return { ok: false, error: 'Cette invitation a expiré (10 jours)' };
  if (new Date() > inv.expiresAt) {
    await prisma.teacherInvitation.update({
      where: { id: inv.id },
      data: { status: INV_STATUS.EXPIRED },
    });
    return { ok: false, error: 'Cette invitation a expiré (10 jours)' };
  }

  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'Le mot de passe doit contenir au moins 6 caractères' };
  }

  const newHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: inv.teacherId },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        passwordSetAt: new Date(),
        invitationStatus: USER_INV_STATUS.ACTIVATED,
        invitationActivatedAt: new Date(),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(), // Email is verified by receiving the invitation
      },
    }),
    prisma.teacherInvitation.update({
      where: { id: inv.id },
      data: {
        status: INV_STATUS.ACTIVATED,
        activatedAt: new Date(),
        activateIpAddress: ipAddress,
        activateUserAgent: userAgent,
      },
    }),
  ]);

  // Notify admin(s) that an invited teacher has activated their account
  // and is now ACTIVE (bypassed PENDING_APPROVAL by design — admin already
  // pre-approved by clicking the "Invite new teacher" button).
  // Fire-and-forget: don't block activation if email fails.
  notifyAdminsInvitedTeacherActivated(inv.teacherId).catch((e) =>
    console.error('Invited teacher activation admin notify error:', e),
  );

  return { ok: true };
}

/**
 * Cancel an invitation (admin action)
 */
export async function cancelInvitation(invitationId: string) {
  const inv = await prisma.teacherInvitation.findUnique({ where: { id: invitationId } });
  if (!inv) return { ok: false, error: 'Invitation introuvable' };
  if (inv.status === INV_STATUS.ACTIVATED)
    return { ok: false, error: "Impossible d'annuler une invitation activée" };

  await prisma.$transaction([
    prisma.teacherInvitation.update({
      where: { id: invitationId },
      data: {
        status: INV_STATUS.CANCELLED,
        cancelledAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: inv.teacherId },
      data: {
        invitationStatus: USER_INV_STATUS.INVITATION_EXPIRED,
      },
    }),
  ]);

  return { ok: true };
}

/**
 * Expire stale invitations (called by cron or on-demand)
 */
export async function expireStaleInvitations() {
  const now = new Date();
  const stale = await prisma.teacherInvitation.findMany({
    where: {
      status: { in: [INV_STATUS.PENDING, INV_STATUS.SENT, INV_STATUS.CLICKED] },
      expiresAt: { lt: now },
    },
    select: { id: true, teacherId: true },
  });

  if (stale.length === 0) return { expired: 0 };

  await prisma.$transaction([
    prisma.teacherInvitation.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: INV_STATUS.EXPIRED },
    }),
    prisma.user.updateMany({
      where: { id: { in: stale.map((s) => s.teacherId) } },
      data: { invitationStatus: USER_INV_STATUS.INVITATION_EXPIRED },
    }),
  ]);

  return { expired: stale.length };
}

// ======================== HELPER FUNCTIONS ========================

const GENERIC_FIRST_NAMES = new Set([
  'enseignant',
  'teacher',
  'prof',
  'professeur',
  'm.',
  'mr',
  'mme',
  'mme.',
  'monsieur',
  'madame',
  'utilisateur',
  'user',
  'admin',
  'test',
  'élève',
  'eleve',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
]);

/**
 * Compute a sensible first name to use in greeting.
 * Falls back to email prefix or "Cher enseignant" if the first name is missing or generic.
 */
function computeFirstName(fullName: string, email: string): string {
  const first = (fullName.split(' ')[0] || '').trim();
  if (first && !GENERIC_FIRST_NAMES.has(first.toLowerCase()) && first.length >= 2) {
    return first;
  }
  // Fallback: derive from email local-part (before @)
  const local = (email.split('@')[0] || '').trim();
  if (local) {
    // Strip dots/underscores/digits and title-case
    const cleaned = local
      .replace(/[._\-]+/g, ' ')
      .replace(/\d+/g, '')
      .trim();
    if (cleaned.length >= 2) {
      return cleaned
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .slice(0, 30);
    }
  }
  return 'Cher enseignant';
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ======================== EMAIL TEMPLATE ========================

function renderInvitationEmail(args: {
  teacherName: string;
  teacherEmail: string;
  acceptUrl: string;
  landingUrl: string;
  tempPassword: string;
  fileCount: number;
  customMessage?: string | null;
  expiresAt: Date;
}): string {
  const {
    teacherName,
    teacherEmail,
    acceptUrl,
    landingUrl,
    tempPassword,
    fileCount,
    customMessage,
  } = args;
  const firstName = computeFirstName(teacherName, teacherEmail);
  const safeName = htmlEscape(teacherName);
  const safeFirst = htmlEscape(firstName);
  const safeEmail = htmlEscape(teacherEmail);
  const safePassword = htmlEscape(tempPassword);
  const safeCustomMessage = customMessage ? htmlEscape(customMessage) : '';
  const hasFiles = fileCount > 0;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Rejoignez Examanet — votre espace enseignant</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<!-- Preheader (hidden) -->
<div style="display:none;max-height:0;overflow:hidden">${hasFiles ? `${fileCount} ressources vous attendent sur Examanet` : 'Activez votre compte enseignant gratuit sur Examanet'}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

  <!-- HERO HEADER -->
  <tr><td>
    <div style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#ec4899 100%);border-radius:20px 20px 0 0;padding:48px 40px;text-align:center;position:relative;overflow:hidden">
      <div style="position:absolute;top:20px;left:20px;font-size:32px;opacity:0.4">✨</div>
      <div style="position:absolute;top:32px;right:24px;font-size:28px;opacity:0.4">🎓</div>
      <div style="position:absolute;bottom:24px;left:32px;font-size:24px;opacity:0.4">📚</div>
      <div style="position:absolute;bottom:32px;right:20px;font-size:28px;opacity:0.4">⭐</div>

      <div style="display:inline-block;background:rgba(255,255,255,0.18);padding:6px 14px;border-radius:999px;color:white;font-size:12px;font-weight:700;letter-spacing:1px;backdrop-filter:blur(8px)">EXAMANET</div>

      <h1 style="margin:20px 0 0;color:white;font-size:34px;line-height:1.15;font-weight:800;letter-spacing:-0.5px">
        ${hasFiles ? `Vos ressources vous attendent` : `Rejoignez l'aventure`} 🎓
      </h1>
      <p style="margin:14px auto 0;color:rgba(255,255,255,0.95);font-size:16px;line-height:1.5;max-width:480px">
        ${
          hasFiles
            ? `${safeFirst}, on a préparé <strong style="background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:8px">${fileCount} de vos ressources</strong> pour les rendre visibles à des milliers d'élèves tunisiens.`
            : `${safeFirst}, on vous a réservé une place dans la communauté <strong>Examanet</strong> — la plateforme pédagogique #1 en Tunisie.`
        }
      </p>
    </div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:white;padding:40px 40px 32px">

    ${customMessage ? `<div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-left:4px solid #f59e0b;padding:16px 20px;border-radius:8px;margin-bottom:28px"><p style="margin:0;color:#78350f;font-size:14px;line-height:1.6;font-style:italic">${safeCustomMessage.replace(/\n/g, '<br>')}</p></div>` : ''}

    <p style="margin:0 0 16px 0;font-size:17px;line-height:1.6;color:#0f172a">Bonjour <strong style="color:#7c3aed">${safeFirst}</strong> 👋</p>

    ${
      hasFiles
        ? `
      <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#334155">
        Vous avez partagé <strong>${fileCount} ressource${fileCount > 1 ? 's' : ''}</strong> via JotForm / devoirat.net ces dernières années.
        Nous les avons <strong>conservées, indexées et publiées</strong> sur Examanet — la plateforme qui rassemble désormais des milliers de profs et d'élèves tunisiens.
      </p>
    `
        : `
      <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#334155">
        <strong>Examanet</strong> est la plateforme pédagogique de référence en Tunisie :
        des milliers de ressources (devoirs, cours, exercices, corrigés) partagées par des profs comme vous,
        consultées chaque mois par des dizaines de milliers d'élèves.
      </p>
    `
    }

    <!-- ${hasFiles ? 'Files summary' : 'Why join'} box -->
    ${
      hasFiles
        ? `
      <div style="background:linear-gradient(135deg,#faf5ff 0%,#fef3c7 100%);border:2px solid #e9d5ff;border-radius:16px;padding:24px;margin:24px 0">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);color:white;width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;box-shadow:0 4px 12px rgba(124,58,237,0.25)">📚</div>
          <div>
            <div style="font-size:13px;color:#7c3aed;font-weight:700;letter-spacing:0.3px;text-transform:uppercase">VOS RESSOURCES SONT EN LIGNE</div>
            <div style="font-size:26px;color:#0f172a;font-weight:800;margin-top:2px;line-height:1.1">${fileCount} fichier${fileCount > 1 ? 's' : ''} publié${fileCount > 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>
    `
        : `
      <div style="background:linear-gradient(135deg,#faf5ff 0%,#fef3c7 100%);border:2px solid #e9d5ff;border-radius:16px;padding:24px;margin:24px 0">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);color:white;width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;box-shadow:0 4px 12px rgba(124,58,237,0.25)">🚀</div>
          <div>
            <div style="font-size:13px;color:#7c3aed;font-weight:700;letter-spacing:0.3px;text-transform:uppercase">VOTRE PLACE EST RÉSERVÉE</div>
            <div style="font-size:20px;color:#0f172a;font-weight:800;margin-top:2px;line-height:1.2">Accédez à +2 600 sujets Bac et 11 000+ ressources</div>
          </div>
        </div>
      </div>
    `
    }

    <p style="margin:24px 0 16px 0;font-size:16px;line-height:1.6;color:#334155">
      ${
        hasFiles
          ? `En activant votre compte enseignant gratuit, vous pouvez :`
          : `Voici ce que vous obtenez en activant votre compte gratuit :`
      }
    </p>

    <!-- Benefits list -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 8px">
      ${
        hasFiles
          ? `
      <tr><td style="padding:12px 0">
        <table role="presentation"><tr>
          <td style="vertical-align:top;padding-right:14px">
            <div style="background:linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%);color:#15803d;width:36px;height:36px;border-radius:10px;text-align:center;line-height:36px;font-size:18px;flex-shrink:0">✓</div>
          </td>
          <td style="font-size:15px;line-height:1.5;color:#334155;padding-top:6px">
            <strong>Récupérer vos ${fileCount} fichier${fileCount > 1 ? 's' : ''}</strong> — versions Word d'origine et PDF propres (sans watermark)
          </td>
        </tr></table>
      </td></tr>
      `
          : `
      <tr><td style="padding:12px 0">
        <table role="presentation"><tr>
          <td style="vertical-align:top;padding-right:14px">
            <div style="background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%);color:#1e40af;width:36px;height:36px;border-radius:10px;text-align:center;line-height:36px;font-size:18px;flex-shrink:0">📚</div>
          </td>
          <td style="font-size:15px;line-height:1.5;color:#334155;padding-top:6px">
            <strong>Publier vos propres ressources</strong> — cours, séries d'exercices, devoirs, corrigés
          </td>
        </tr></table>
      </td></tr>
      `
      }
      <tr><td style="padding:12px 0">
        <table role="presentation"><tr>
          <td style="vertical-align:top;padding-right:14px">
            <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);color:#a16207;width:36px;height:36px;border-radius:10px;text-align:center;line-height:36px;font-size:18px;flex-shrink:0">📊</div>
          </td>
          <td style="font-size:15px;line-height:1.5;color:#334155;padding-top:6px">
            <strong>Voir les statistiques</strong> de vos ressources — téléchargements, vues, notes, commentaires
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:12px 0">
        <table role="presentation"><tr>
          <td style="vertical-align:top;padding-right:14px">
            <div style="background:linear-gradient(135deg,#fce7f3 0%,#fbcfe8 100%);color:#be185d;width:36px;height:36px;border-radius:10px;text-align:center;line-height:36px;font-size:18px;flex-shrink:0">✏️</div>
          </td>
          <td style="font-size:15px;line-height:1.5;color:#334155;padding-top:6px">
            <strong>Modifier vos fichiers</strong> après publication (correction, mise à jour, ajout)
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:12px 0">
        <table role="presentation"><tr>
          <td style="vertical-align:top;padding-right:14px">
            <div style="background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%);color:#1e40af;width:36px;height:36px;border-radius:10px;text-align:center;line-height:36px;font-size:18px;flex-shrink:0">👥</div>
          </td>
          <td style="font-size:15px;line-height:1.5;color:#334155;padding-top:6px">
            <strong>Gagner en visibilité</strong> auprès de <strong>25 000+ élèves et enseignants</strong> tunisiens qui utilisent Examanet chaque mois
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:12px 0">
        <table role="presentation"><tr>
          <td style="vertical-align:top;padding-right:14px">
            <div style="background:linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%);color:#15803d;width:36px;height:36px;border-radius:10px;text-align:center;line-height:36px;font-size:18px;flex-shrink:0">💬</div>
          </td>
          <td style="font-size:15px;line-height:1.5;color:#334155;padding-top:6px">
            <strong>Recevoir des messages</strong> d'élèves qui ont des questions sur vos devoirs
          </td>
        </tr></table>
      </td></tr>
    </table>

    <!-- Login credentials card -->
    <div style="background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border:2px solid #e2e8f0;border-radius:16px;padding:24px;margin:32px 0">
      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">🔐 VOS IDENTIFIANTS DE CONNEXION</div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#64748b;width:140px;vertical-align:middle">📧 Email</td>
          <td style="padding:8px 0;font-size:14px;color:#0f172a;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all">${safeEmail}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#64748b;vertical-align:middle">🔑 Mot de passe</td>
          <td style="padding:8px 0;vertical-align:middle">
            <span style="display:inline-block;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:white;padding:10px 18px;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:3px;box-shadow:0 4px 12px rgba(15,23,42,0.15)">${safePassword}</span>
          </td>
        </tr>
      </table>

      <div style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border-radius:10px;padding:12px 16px;margin-top:18px;font-size:13px;color:#78350f;line-height:1.5">
        ⚠️ <strong>Important</strong> — Ce mot de passe est à usage unique. Vous devrez le changer lors de l'activation. Vous avez <strong>${INVITATION_TTL_DAYS} jours</strong> pour activer votre compte.
      </div>
    </div>

    <!-- CTA Button -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 12px">
      <tr><td align="center">
        <a href="${acceptUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);color:white;text-decoration:none;padding:18px 48px;border-radius:14px;font-size:17px;font-weight:800;letter-spacing:0.3px;box-shadow:0 8px 24px rgba(124,58,237,0.3);text-transform:uppercase">Activer mon compte gratuit →</a>
      </td></tr>
    </table>

    <p style="text-align:center;font-size:12px;color:#94a3b8;margin:8px 0 32px 0">Ou copier ce lien : <a href="${acceptUrl}" style="color:#7c3aed;text-decoration:underline;word-break:break-all">${acceptUrl}</a></p>

    <!-- Landing page link -->
    <div style="background:#fafafa;border-radius:12px;padding:20px;text-align:center;margin:24px 0 8px">
      <p style="margin:0 0 8px 0;font-size:14px;color:#64748b">Envie d'en savoir plus sur les avantages pour les enseignants ?</p>
      <a href="${landingUrl}" style="color:#7c3aed;font-weight:700;text-decoration:none;font-size:15px">Découvrir tous les avantages →</a>
    </div>

    <p style="margin:32px 0 0 0;font-size:15px;line-height:1.6;color:#334155">À très vite sur Examanet,<br><strong style="color:#7c3aed">L'équipe Examanet</strong></p>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#0f172a;padding:24px 40px;border-radius:0 0 20px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center">
          <div style="margin-bottom:12px">
            <span style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#ec4899 100%);-webkit-background-clip:text;background-clip:text;color:transparent;font-size:22px;font-weight:800;letter-spacing:-0.5px">Examanet</span>
          </div>
          <p style="margin:0 0 4px 0;font-size:12px;color:#94a3b8">La plateforme pédagogique #1 en Tunisie</p>
          <p style="margin:0 0 12px 0;font-size:12px;color:#64748b">
            Cet email a été envoyé à <strong style="color:#cbd5e1">${safeEmail}</strong>.
          </p>
          <p style="margin:0;font-size:11px;color:#64748b">
            Vous ne souhaitez pas rejoindre Examanet ? <a href="${SITE_URL}/api/invitation/unsubscribe?token=${encodeURIComponent(teacherEmail)}" style="color:#a78bfa;text-decoration:underline">Se désinscrire</a>
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#475569">
            © ${new Date().getFullYear()} Examanet · Made with ❤️ in Tunisia 🇹🇳
          </p>
        </td>
      </tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

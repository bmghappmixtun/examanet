/* eslint-disable */
import { Resend } from 'resend';
import {
  renderResourceRejectedEmail,
  renderEditApprovedEmail,
  renderEditRejectedEmail,
  renderNewEditPendingEmail,
} from './email-templates';
import {
  renderEmailShell,
  EMAIL_FONT_STACK,
  paragraph,
  muted,
  ctaButton,
  infoCard,
} from './email-shell';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'Examanet <noreply@examanet.com>';

// Always include dev code as fallback in case email is not delivered
// (e.g., Resend test mode, custom domain not verified, spam folder)
const ALWAYS_INCLUDE_DEV_CODE = process.env.HIDE_DEV_CODE !== 'true';

export class EmailResult {
  constructor(
    public success: boolean,
    public id: string,
    public error?: string,
    public devCode?: string,
  ) {}
}

export async function sendOTPEmail(
  to: string,
  code: string,
  firstName?: string,
): Promise<EmailResult> {
  // Skip real sending if disabled (tests)
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] OTP for ${to}: ${code}`);
    return new EmailResult(true, 'test-mode', undefined, code);
  }
  const html = renderOTPEmail(code, firstName || '');
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] To: ${to}`);
    console.log(`   Code: ${code}`);
    return new EmailResult(true, 'dev-mode', undefined, code);
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: `${code} — Votre code Examanet`,
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message, code);
    }
    // Success - still include dev code as fallback in case email goes to spam
    return new EmailResult(
      true,
      result.data?.id || 'sent',
      undefined,
      ALWAYS_INCLUDE_DEV_CODE ? code : undefined,
    );
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message, code);
  }
}

export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  role: string,
): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Welcome for ${to}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderWelcomeEmail(firstName, role);
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] To: ${to}`);
    console.log(`   Welcome ${firstName}!`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: 'Bienvenue sur Examanet !',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export async function sendWelcomeConfirmedEmail(
  to: string,
  firstName: string,
  role: string,
): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Welcome confirmed for ${to}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderWelcomeConfirmedEmail(firstName, role);
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] To: ${to}`);
    console.log(`   Welcome confirmed ${firstName}!`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: 'Compte activé — Bienvenue sur Examanet !',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export async function sendContactEmail(payload: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Contact from ${payload.email}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderContactEmail(payload);
  const CONTACT_RECIPIENT = process.env.CONTACT_EMAIL || 'boutiti.mehdi@gmail.com';
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] Contact from ${payload.email} -> ${CONTACT_RECIPIENT}`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [CONTACT_RECIPIENT],
      replyTo: payload.email,
      subject: `[Contact] ${payload.subject}`,
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', payload.email, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', payload.email, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export async function sendTeacherApprovalEmail(
  to: string,
  firstName: string,
  approved: boolean,
  opts?: { lastName?: string; dashboardUrl?: string; subjects?: string[]; level?: string },
): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Teacher approval for ${to} approved=${approved}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderTeacherApprovalEmail(firstName, approved, opts);
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] Teacher approval for ${to} approved=${approved}`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: approved
        ? 'Votre compte enseignant est approuvé ✓'
        : 'Mise à jour de votre compte enseignant',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export async function sendTeacherFileRequestEmail(opts: {
  to: string;
  firstName: string;
  lastName: string;
  email?: string;
  resourceTitle?: string;
  uploadUrl?: string;
  note?: string | null;
}): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Teacher file request for ${opts.to}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderTeacherFileRequestEmail(opts);
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] Teacher file request for ${opts.to}`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [opts.to],
      subject: 'Action requise : uploadez votre fichier',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', opts.to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', opts.to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export async function sendAdminVerificationFilesEmail(opts: {
  to?: string;
  teacherName?: string;
  teacherEmail?: string;
  teacher?: { firstName: string; lastName: string; email: string };
  resourceTitle?: string;
  resourceId?: number | string;
  reviewUrl?: string;
  files?: Array<{
    fileName: string;
    fileSize: number;
    fileUrl: string;
    type: string | null;
    uploadedAt: string;
  }>;
  count?: number;
  total?: number;
  adminUrl?: string;
}): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Admin verification files`);
    return new EmailResult(true, 'test-mode');
  }
  // Normalize: support both old flat shape and new nested shape
  const teacherName =
    opts.teacherName ??
    (opts.teacher ? `${opts.teacher.firstName} ${opts.teacher.lastName}`.trim() : 'Enseignant');
  const teacherEmail = opts.teacherEmail ?? opts.teacher?.email ?? '';
  const resourceTitle = opts.resourceTitle ?? 'Ressource';
  const reviewUrl = opts.reviewUrl ?? opts.adminUrl ?? 'https://examanet.com/admin/approbations';
  const html = renderAdminVerificationFilesEmail({
    teacherName,
    teacherEmail,
    resourceTitle,
    resourceId: opts.resourceId ?? '',
    reviewUrl,
  });
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] Admin verification files`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [opts.to || 'admin@examanet.com'],
      subject: `📁 Fichier à vérifier — ${resourceTitle}`,
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', opts.to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', opts.to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export async function sendResourceApprovedEmail(
  to: string,
  firstName: string,
  resourceTitle: string,
  approved: boolean,
  resourceUrl?: string,
): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Resource approved for ${to} approved=${approved} url=${resourceUrl}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderResourceApprovedEmail(firstName, resourceTitle, approved, resourceUrl);
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] Resource approved for ${to} approved=${approved}`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: approved ? '✓ Votre ressource est en ligne' : 'Ressource rejetée',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export function renderOTPEmail(code: string, firstName: string): string {
  return renderEmailShell({
    accent: 'blue',
    icon: '🔐',
    title: 'Vérifiez votre email',
    subtitle: 'Votre code de confirmation',
    preheader: 'Votre code OTP Examanet',
    body: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-family:${EMAIL_FONT_STACK};">Bonjour <strong style="color:#0F172A;">${firstName || ''}</strong>,</p>
      ${paragraph('Utilisez le code ci-dessous pour confirmer votre adresse email et activer votre compte Examanet.')}
      <div style="background:#0EA5E9;color:white;font-size:36px;font-weight:800;text-align:center;padding:24px;border-radius:12px;letter-spacing:8px;margin:24px 0;font-family:${EMAIL_FONT_STACK};">${code}</div>
      ${muted("Ce code est valide 30 minutes. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.")}
    `,
  });
}

export function renderWelcomeEmail(firstName: string, role: string): string {
  return renderEmailShell({
    accent: 'blue',
    icon: '👋',
    title: `Bienvenue ${firstName} !`,
    subtitle: 'Votre compte Examanet a été créé',
    preheader: 'Bienvenue sur Examanet',
    body: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-family:${EMAIL_FONT_STACK};">Bonjour <strong style="color:#0F172A;">${firstName}</strong>,</p>
      ${paragraph(`Votre compte Examanet a été créé avec succès. Vous êtes inscrit en tant que <strong>${role === 'TEACHER' ? 'enseignant' : 'élève'}</strong>.`)}
      ${paragraph('Pour activer votre compte et accéder à toutes les fonctionnalités, veuillez vérifier votre adresse email en utilisant le code que nous venons de vous envoyer.')}
    `,
  });
}

export function renderWelcomeConfirmedEmail(firstName: string, role: string): string {
  return renderEmailShell({
    accent: 'green',
    icon: '🎉',
    title: 'Compte activé !',
    subtitle: 'Votre email a été vérifié',
    preheader: 'Compte activé',
    body: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-family:${EMAIL_FONT_STACK};">Bonjour <strong style="color:#0F172A;">${firstName}</strong>,</p>
      ${paragraph('Votre adresse email a été vérifiée avec succès. Votre compte Examanet est maintenant actif !')}
      ${paragraph(`Vous pouvez désormais profiter pleinement d'Examanet en tant que <strong>${role === 'TEACHER' ? 'enseignant' : 'élève'}</strong>.`)}
    `,
  });
}

export function renderContactEmail(p: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): string {
  const safeName = p.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeEmail = p.email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeSubject = p.subject.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeMessage = p.message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  return renderEmailShell({
    accent: 'gray',
    icon: '✉️',
    title: `Contact: ${safeSubject}`,
    subtitle: `Message de ${safeName}`,
    preheader: `Nouveau message de ${safeName}`,
    body: `
      ${infoCard('Expéditeur', `${safeName} &lt;${safeEmail}&gt;`, 'gray')}
      <div style="color:#0F172A;font-size:15px;line-height:1.65;font-family:${EMAIL_FONT_STACK};">${safeMessage}</div>
    `,
  });
}

export function renderTeacherApprovalEmail(
  firstName: string,
  approved: boolean,
  opts?: {
    lastName?: string;
    dashboardUrl?: string;
    subjects?: string[];
    level?: string;
  },
): string {
  const {
    lastName = '',
    dashboardUrl = 'https://examanet.com/enseignant',
    subjects = [],
    level = '',
  } = opts || {};
  const safeFirst = firstName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeLast = lastName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fullName = `${safeFirst} ${safeLast}`.trim();
  const F = EMAIL_FONT_STACK;

  if (approved) {
    return renderEmailShell({
      accent: 'violet',
      icon: '🎓',
      title: "Bienvenue dans l'équipe !",
      subtitle: 'Votre compte enseignant est approuvé',
      preheader: 'Compte enseignant approuvé',
      body: `
        <p style="margin:0 0 16px;font-size:18px;color:#0F172A;font-weight:700;font-family:${F};">Bonjour <span style="color:#7C3AED;">${safeFirst}</span> 👋</p>
        ${paragraph(`C'est officiel ! Votre profil enseignant sur <strong>Examanet</strong> a été validé par notre équipe. Vous pouvez maintenant partager vos cours, séries d'exercices, devoirs et corrigés avec <strong>des milliers d'élèves tunisiens</strong>.`)}

        <div style="background:linear-gradient(135deg,#FAF5FF 0%,#FEF3C7 100%);border:2px solid #E9D5FF;border-radius:16px;padding:24px;margin:24px 0;font-family:${F};">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#A855F7);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex-shrink:0;">${(safeFirst[0] || 'E').toUpperCase()}${(safeLast[0] || '').toUpperCase()}</div>
            <div>
              <div style="font-size:16px;font-weight:800;color:#0F172A;line-height:1.2;font-family:${F};">${fullName}</div>
              <div style="font-size:13px;color:#7C3AED;font-weight:600;font-family:${F};">Compte enseignant vérifié ✓</div>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;padding-top:16px;border-top:1px solid rgba(124,58,237,0.15);">
            <span style="background:#fff;border:1px solid #E9D5FF;border-radius:10px;padding:8px 12px;font-size:12px;color:#6B21A8;font-weight:600;font-family:${F};">✓ Identité vérifiée</span>
            <span style="background:#fff;border:1px solid #E9D5FF;border-radius:10px;padding:8px 12px;font-size:12px;color:#6B21A8;font-weight:600;font-family:${F};">✓ Fichiers contrôlés</span>
          </div>
        </div>

        ${ctaButton(dashboardUrl, 'Accéder à mon dashboard', 'violet')}
        <div style="text-align:center;margin:0 0 24px;font-family:${F};">
          <p style="margin:0 0 4px;color:#94A3B8;font-size:12px;font-family:${F};">ou connectez-vous sur :</p>
          <p style="margin:0;color:#64748B;font-size:13px;word-break:break-all;font-family:${F};">${dashboardUrl}</p>
        </div>
        ${muted("Si vous avez des questions, n'hésitez pas à nous contacter via notre page de contact.")}
      `,
    });
  } else {
    return renderEmailShell({
      accent: 'red',
      icon: '😔',
      title: 'Demande non retenue',
      subtitle: "Votre compte enseignant n'a pas été approuvé",
      preheader: 'Compte enseignant non approuvé',
      body: `
        <p style="margin:0 0 16px;font-size:18px;color:#0F172A;font-weight:700;font-family:${F};">Bonjour <span>${safeFirst}</span>,</p>
        ${paragraph(`Après étude de votre dossier, nous ne sommes pas en mesure d'approuver votre demande d'inscription en tant qu'enseignant sur Examanet pour le moment.`)}
        ${muted("Pour plus d'informations, contactez-nous via notre page de contact. Nous serons heureux de vous aider.")}
      `,
    });
  }
}

export function renderAdminVerificationFilesEmail(opts: {
  teacherName: string;
  teacherEmail: string;
  resourceTitle: string;
  resourceId: number | string;
  reviewUrl: string;
}): string {
  const safeTeacherName = opts.teacherName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeResourceTitle = opts.resourceTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const F = EMAIL_FONT_STACK;
  return renderEmailShell({
    accent: 'blue',
    icon: '📁',
    title: 'Fichier à vérifier',
    subtitle: 'Un nouvel enseignant attend votre validation',
    preheader: `Nouveau fichier de ${safeTeacherName}`,
    body: `
      ${infoCard('Enseignant', `${safeTeacherName} &lt;${opts.teacherEmail}&gt;`, 'blue')}
      ${infoCard('Ressource', `${safeResourceTitle} <span style="color:#94A3B8;font-size:12px;">(ID: ${opts.resourceId})</span>`, 'gray')}
      ${ctaButton(opts.reviewUrl, 'Examiner le fichier →', 'blue')}
    `,
  });
}

export function renderTeacherFileRequestEmail(opts: {
  to: string;
  firstName: string;
  lastName: string;
  resourceTitle?: string;
  uploadUrl?: string;
}): string {
  const safeFirst = opts.firstName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTitle = (opts.resourceTitle ?? 'votre fichier')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html><body style="font-family:sans-serif;background:#f8fafc;padding:20px">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:32px">
<h1 style="color:#0f172a">Bonjour ${safeFirst},</h1>
<p>Pour finaliser la publication de votre ressource <strong>${safeTitle}</strong>, merci d'uploader le fichier original.</p>
<div style="text-align:center;margin:24px 0">
<a href="${opts.uploadUrl}" style="background:linear-gradient(135deg,#3B82F6,#2563EB);color:white;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:bold;display:inline-block">Uploader le fichier</a>
</div>
<p style="color:#64748b;font-size:13px">Ce lien est personnel et expire dans 7 jours.</p>
</div>
</body></html>`;
}

export function renderResourceApprovedEmail(
  firstName: string,
  resourceTitle: string,
  approved: boolean,
  resourceUrl?: string,
): string {
  const safeFirst = firstName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTitle = resourceTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const fullResourceUrl = resourceUrl
    ? resourceUrl.startsWith('http')
      ? resourceUrl
      : `${SITE_URL}${resourceUrl}`
    : null;
  const F = EMAIL_FONT_STACK;
  if (approved) {
    return renderEmailShell({
      accent: 'green',
      icon: '✅',
      title: 'Ressource approuvée !',
      subtitle: 'Votre ressource est maintenant en ligne',
      preheader: `Approuvée : ${safeTitle.slice(0, 60)}`,
      body: `
        <p style="margin:0 0 16px;font-size:16px;color:#0F172A;font-family:${F};">Bonjour <strong style="color:#0F172A;">${safeFirst}</strong>,</p>
        ${paragraph(`Excellente nouvelle ! La ressource que vous avez soumise a été approuvée par notre équipe et est désormais <strong style="color:#0F172A;">en ligne sur Examanet</strong>. Elle est maintenant visible par des milliers d'élèves et enseignants tunisiens.`)}
        ${infoCard('Ressource publiée', safeTitle, 'green')}
        ${fullResourceUrl ? ctaButton(fullResourceUrl, 'Voir la ressource en ligne →', 'green') + `<p style="margin:0 0 24px;text-align:center;color:#94A3B8;font-size:12px;word-break:break-all;font-family:${F};">${fullResourceUrl}</p>` : ''}
        ${muted('Merci pour votre contribution à Examanet ! Vos ressources aident les élèves tunisiens à réussir leurs études.')}
      `,
    });
  }
  return renderEmailShell({
    accent: 'red',
    icon: '❌',
    title: 'Ressource non retenue',
    subtitle: "Votre soumission n'a pas été approuvée",
    preheader: `Refusée : ${safeTitle.slice(0, 60)}`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;color:#0F172A;font-family:${F};">Bonjour <strong style="color:#0F172A;">${safeFirst}</strong>,</p>
      ${paragraph(`Malheureusement, la ressource que vous avez soumise n'a pas été retenue pour publication sur Examanet.`)}
      ${infoCard('Ressource refusée', safeTitle, 'red')}
      ${muted(`N'hésitez pas à soumettre une nouvelle version après avoir consulté nos <a href="${SITE_URL}/cgu" style="color:#10B981;font-weight:600;text-decoration:underline;">conditions d'utilisation</a>.`)}
    `,
  });
}

export async function sendResourceRejectedEmail(
  to: string,
  firstName: string,
  resourceTitle: string,
  reason: string,
  resourceUrl?: string,
): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Resource rejected for ${to}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderResourceRejectedEmail(firstName, resourceTitle, reason, resourceUrl);
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] Resource rejected for ${to}`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: 'Ressource non retenue',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export async function sendEditApprovedEmail(
  to: string,
  firstName: string,
  resourceTitle: string,
  resourceUrl?: string,
): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Edit approved for ${to}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderEditApprovedEmail(firstName, resourceTitle, resourceUrl ?? '');
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] Edit approved for ${to}`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: '✓ Modification approuvée',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export async function sendEditRejectedEmail(
  to: string,
  firstName: string,
  resourceTitle: string,
  reason: string,
  resourceUrl?: string,
): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Edit rejected for ${to}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderEditRejectedEmail(firstName, resourceTitle, reason, resourceUrl ?? '');
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] Edit rejected for ${to}`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: 'Modification non retenue',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export async function sendNewEditPendingEmail(
  to: string,
  firstName: string,
  resourceTitle: string,
  summary: string,
  resourceUrl: string,
  wasPreviouslyRejected?: boolean,
  previousRejectionReason?: string,
): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] New edit pending for ${to}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderNewEditPendingEmail(
    firstName,
    resourceTitle,
    summary,
    resourceUrl,
    wasPreviouslyRejected ?? false,
    previousRejectionReason,
  );
  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] New edit pending for ${to}`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: '📝 Nouvelle modification en attente',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [NEW EDIT PENDING THROW]', to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

// ============================================================================
// PASSWORD CHANGED NOTIFICATION
// ============================================================================

/**
 * Send a confirmation email after a successful password change.
 * The email includes:
 *  - Confirmation that the password was changed
 *  - Date/time of change (Africa/Tunis timezone)
 *  - IP address
 *  - User-Agent (browser/device)
 *  - A clear "if this wasn't you" warning with a contact link
 *  - Security recommendations
 */
export async function sendPasswordChangedEmail(opts: {
  to: string;
  firstName: string;
  ip: string;
  userAgent: string;
}): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Password changed for ${opts.to}`);
    return new EmailResult(true, 'test-mode');
  }

  const html = renderPasswordChangedEmail(opts);

  if (!resend) {
    console.log(`\n📧 [EMAIL - DEV] To: ${opts.to}`);
    console.log(`   Subject: Votre mot de passe Examanet a été modifié`);
    console.log(`   IP: ${opts.ip}`);
    console.log(`   UA: ${opts.userAgent}`);
    return new EmailResult(true, 'dev-mode');
  }

  try {
    const result: any = await resend.emails.send({
      from: FROM,
      to: [opts.to],
      subject: '🔒 Votre mot de passe Examanet a été modifié',
      html,
    });
    if (result.error) {
      console.error('📧 [EMAIL ERROR]', opts.to, '→', result.error.message);
      return new EmailResult(false, 'failed', result.error.message);
    }
    console.log(`[password-changed] email sent to ${opts.to} ip=${opts.ip}`);
    return new EmailResult(true, result.data?.id || 'sent');
  } catch (e: any) {
    console.error('📧 [EMAIL THROW]', opts.to, '→', e?.message);
    return new EmailResult(false, 'threw', e?.message);
  }
}

export function renderPasswordChangedEmail(opts: {
  firstName: string;
  ip: string;
  userAgent: string;
}): string {
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const safeFirst = (opts.firstName || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeIp = (opts.ip || 'Inconnue').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeUa = (opts.userAgent || 'Inconnu').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Format date in French timezone
  const changedAt = new Date().toLocaleString('fr-FR', {
    timeZone: 'Africa/Tunis',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Parse user-agent to display a friendly name
  let device = 'Appareil inconnu';
  if (/iPhone/.test(opts.userAgent)) device = '📱 iPhone';
  else if (/iPad/.test(opts.userAgent)) device = '📱 iPad';
  else if (/Android/.test(opts.userAgent)) device = '📱 Android';
  else if (/Mac OS X/.test(opts.userAgent)) device = '💻 Mac';
  else if (/Windows/.test(opts.userAgent)) device = '💻 Windows';
  else if (/Linux/.test(opts.userAgent)) device = '💻 Linux';
  else if (/curl|wget|http/i.test(opts.userAgent)) device = '🤖 Outil automatisé';

  return renderEmailShell({
    accent: 'green',
    icon: '🔒',
    title: 'Mot de passe modifié',
    subtitle: 'Votre compte Examanet est sécurisé',
    preheader: 'Confirmation de modification du mot de passe',
    body: `
      <p style="margin:0 0 16px;font-size:16px;color:#0F172A;line-height:1.5;font-family:${EMAIL_FONT_STACK};">Bonjour <strong style="color:#0F172A;">${safeFirst}</strong> 👋</p>
      ${paragraph(`Nous vous confirmons que le mot de passe de votre compte Examanet a été modifié avec succès. Vous pouvez désormais vous connecter avec votre nouveau mot de passe.`)}

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin:0 0 24px;font-family:${EMAIL_FONT_STACK};">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#64748B;margin-bottom:12px;">📋 Détails de la modification</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#334155;font-family:${EMAIL_FONT_STACK};">
          <tr><td style="padding:6px 0;width:120px;color:#64748B;">📅 Date</td><td style="padding:6px 0;font-weight:600;">${changedAt} (heure de Tunis)</td></tr>
          <tr><td style="padding:6px 0;color:#64748B;">🌐 Adresse IP</td><td style="padding:6px 0;font-family:monospace;">${safeIp}</td></tr>
          <tr><td style="padding:6px 0;color:#64748B;">💻 Appareil</td><td style="padding:6px 0;">${device}</td></tr>
        </table>
      </div>

      ${ctaButton(`${SITE_URL}/connexion`, 'Se connecter', 'blue')}

      <div style="background:#FEF2F2;border:2px solid #FECACA;border-radius:16px;padding:24px;margin:0 0 24px;font-family:${EMAIL_FONT_STACK};">
        <div style="font-size:16px;font-weight:800;color:#991B1B;margin-bottom:8px;">⚠️ Ce n'est pas vous qui avez modifié le mot de passe ?</div>
        <p style="margin:0 0 16px;font-size:14px;color:#7F1D1D;line-height:1.6;">Si vous n'êtes pas à l'origine de cette modification, votre compte est peut-être compromis. <strong>Contactez-nous immédiatement</strong> pour que nous puissions sécuriser votre compte.</p>
        <a href="${SITE_URL}/contact?subject=Compte%20compromise&motif=password" style="display:inline-block;background:#DC2626;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;font-family:${EMAIL_FONT_STACK};">🚨 Nous contacter d'urgence</a>
      </div>

      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:20px;font-family:${EMAIL_FONT_STACK};">
        <div style="font-size:14px;font-weight:800;color:#92400E;margin-bottom:8px;">💡 Conseils de sécurité</div>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#78350F;line-height:1.7;">
          <li>Utilisez un mot de passe unique (différent de vos autres comptes)</li>
          <li>Ne partagez jamais votre mot de passe avec qui que ce soit</li>
          <li>Méfiez-vous des emails suspects vous demandant votre mot de passe</li>
        </ul>
      </div>
    `,
    footer: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${EMAIL_FONT_STACK};">
        <tr>
          <td>
            <div style="font-weight:700;color:#0F172A;font-size:14px;letter-spacing:-0.2px;font-family:${EMAIL_FONT_STACK};">Examanet</div>
            <div style="color:#94A3B8;font-size:12px;margin-top:2px;font-family:${EMAIL_FONT_STACK};">Plateforme pédagogique #1 en Tunisie</div>
          </td>
          <td align="right" style="color:#94A3B8;font-size:11px;font-family:${EMAIL_FONT_STACK};">
            Conçu avec ❤️<br>pour les élèves tunisiens
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#CBD5E1;text-align:center;font-family:${EMAIL_FONT_STACK};">
        Cet email a été envoyé automatiquement suite à la modification de votre mot de passe.<br>
        Si vous n'êtes pas à l'origine de cette action, contactez-nous via
        <a href="${SITE_URL}/contact" style="color:#0EA5E9;text-decoration:underline;">examanet.com/contact</a>.
      </p>
    `,
  });
}

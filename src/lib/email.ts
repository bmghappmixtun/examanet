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

// 2026-09-06: Lazy-init Resend. process.env.RESEND_API_KEY is UNDEFINED inside
// CF Workers — secrets set via 'wrangler secret put' come through the env
// binding from getCloudflareContext(). Use a memoized lazy getter.
let _resend: Resend | null | undefined = undefined;
let _from: string | undefined = undefined;

async function getMailer(): Promise<{ resend: Resend | null; from: string }> {
  if (_resend !== undefined) {
    return { resend: _resend, from: _from || 'Examanet <noreply@examanet.com>' };
  }
  let apiKey: string | undefined;
  let fromAddr: string | undefined;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    apiKey = (ctx as any).env?.RESEND_API_KEY;
    fromAddr = (ctx as any).env?.EMAIL_FROM;
  } catch {
    // no CF context (dev mode)
  }
  if (!apiKey && typeof process !== 'undefined' && process.env?.RESEND_API_KEY) {
    apiKey = process.env.RESEND_API_KEY;
  }
  if (!fromAddr && typeof process !== 'undefined' && process.env?.EMAIL_FROM) {
    fromAddr = process.env.EMAIL_FROM;
  }
  _resend = apiKey ? new Resend(apiKey) : null;
  _from = fromAddr;
  console.log('[email] Resend initialized:', _resend ? 'YES' : 'NO', 'from:', fromAddr || 'default');
  return { resend: _resend, from: fromAddr || 'Examanet <noreply@examanet.com>' };
}

/**
 * Send an email via Resend. Returns null on success, error message on failure.
 * 2026-09-06: wraps the lazy-init mailer and gracefully handles missing config.
 */
async function sendViaResend(args: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { resend, from } = await getMailer();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — cannot send:', args.subject);
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const result: any = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
    });
    if (result?.error) {
      console.error('[email] Resend error:', args.subject, '→', result.error);
      return { ok: false, error: String(result.error.message || result.error) };
    }
    console.log('[email] Sent:', args.subject, '→', Array.isArray(args.to) ? args.to.join(',') : args.to);
    return { ok: true, id: result?.data?.id };
  } catch (e: any) {
    console.error('[email] Resend exception:', args.subject, '→', e?.message);
    return { ok: false, error: e?.message || 'unknown' };
  }
}

// SECURITY: Only return devCode in non-production environments.
// In production, the dev code should NEVER be exposed (security risk).
const INCLUDE_DEV_CODE = process.env.NODE_ENV !== 'production' && process.env.HIDE_DEV_CODE !== 'true';

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

  const sendResult = await sendViaResend({
    to: [to],
    subject: `${code} — Votre code Examanet`,
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error, code);
  }
  // Success - still include dev code as fallback in case email goes to spam
  return new EmailResult(
    true,
    sendResult.id || 'sent',
    undefined,
    INCLUDE_DEV_CODE ? code : undefined,
  );
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

  const sendResult = await sendViaResend({
    to: [to],
    subject: 'Bienvenue sur Examanet !',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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

  const sendResult = await sendViaResend({
    to: [to],
    subject: 'Compte activé — Bienvenue sur Examanet !',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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

  const sendResult = await sendViaResend({
    to: [CONTACT_RECIPIENT],
    subject: `[Contact] ${payload.subject}`,
    html,
  });
  // Note: replyTo would need to be supported by sendViaResend. For now, contact
  // forms just go to CONTACT_RECIPIENT — the user's email is in the body.
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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

  const sendResult = await sendViaResend({
    to: [to],
    subject: approved
      ? 'Votre compte enseignant est approuvé ✓'
      : 'Mise à jour de votre compte enseignant',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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

  const sendResult = await sendViaResend({
    to: [opts.to],
    subject: 'Action requise : uploadez votre fichier',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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

  const sendResult = await sendViaResend({
    to: [opts.to || 'admin@examanet.com'],
    subject: `📁 Fichier à vérifier — ${resourceTitle}`,
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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

  const sendResult = await sendViaResend({
    to: [to],
    subject: approved ? '✓ Votre ressource est en ligne' : 'Ressource rejetée',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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

// 2026-09-11: Email sent when teacher becomes VERIFIED (after file approval)
export function renderTeacherVerifiedEmail(firstName: string): string {
  return renderEmailShell({
    accent: 'green',
    icon: '🎉',
    title: 'Vous êtes désormais un Enseignant Vérifié !',
    subtitle: 'Votre badge est maintenant visible',
    preheader: 'Félicitations, votre compte enseignant a été vérifié',
    body: `
      <p style="margin:0 0 8px;color:#0F172A;font-size:16px;font-family:${EMAIL_FONT_STACK};">Bonjour <strong style="color:#0F172A;">${firstName || ''}</strong>,</p>
      ${paragraph('Après vérification de vos 5 fichiers, votre compte enseignant a été <strong style="color:#16A34A;">officiellement vérifié</strong> par notre équipe.')}
      <div style="background:#16A34A;color:white;font-size:18px;font-weight:700;text-align:center;padding:20px;border-radius:12px;margin:24px 0;font-family:${EMAIL_FONT_STACK};">
        ✓ Enseignant Vérifié
      </div>
      ${paragraph('Le badge "✓ Vérifié" est maintenant visible sur votre profil et à côté de vos ressources publiées. Cela renforce la confiance des élèves et parents envers votre travail.')}
      ${paragraph('Vous pouvez dès maintenant publier vos ressources sans restriction. Merci pour votre confiance !')}
    `,
  });
}

export async function sendTeacherVerifiedEmail(opts: {
  to: string;
  firstName: string;
  lastName?: string;
}): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Teacher verified for ${opts.to}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderTeacherVerifiedEmail(opts.firstName);
  const sendResult = await sendViaResend({
    to: [opts.to],
    subject: '🎉 Vous êtes désormais un Enseignant Vérifié !',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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
  const sendResult = await sendViaResend({
    to: [to],
    subject: 'Ressource non retenue',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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
  const sendResult = await sendViaResend({
    to: [to],
    subject: '✓ Modification approuvée',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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
  const sendResult = await sendViaResend({
    to: [to],
    subject: 'Modification non retenue',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
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
    wasPreviouslyRejected,
    previousRejectionReason,
  );
  const sendResult = await sendViaResend({
    to: [to],
    subject: '📝 Nouvelle modification en attente',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
}
export async function sendPasswordChangedEmail(opts: {
  to: string;
  firstName: string;
  ip: string;
  userAgent: string;
  when: number;
}): Promise<EmailResult> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] Password changed for ${opts.to}`);
    return new EmailResult(true, 'test-mode');
  }
  const html = renderPasswordChangedEmail(opts);
  const sendResult = await sendViaResend({
    to: [opts.to],
    subject: '🔒 Votre mot de passe Examanet a été modifié',
    html,
  });
  if (!sendResult.ok) {
    return new EmailResult(false, 'failed', sendResult.error);
  }
  return new EmailResult(true, sendResult.id || 'sent');
}

/**
 * 2026-09-09: Generic email send for new use cases (magic link, etc.).
 * Use this for any new email type. Subject + html are required.
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (process.env.DISABLE_EMAILS === 'true' || process.env.NODE_ENV === 'test') {
    console.log(`[EMAIL SKIP] To: ${Array.isArray(opts.to) ? opts.to.join(',') : opts.to}, Subject: ${opts.subject}`);
    return { ok: true, id: 'test-mode' };
  }
  
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const sendResult = await sendViaResend({
    to: recipients,
    subject: opts.subject,
    html: opts.html,
  });
  
  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error };
  }
  return { ok: true, id: sendResult.id || 'sent' };
}

// @ts-nocheck
import { Resend } from 'resend';
import { renderNewTeacherEmail, renderNewResourceEmail, renderTeacherActivatedEmail } from './email-templates';
import { getAdminEmailsFromConfig } from './admin-config';

// 2026-09-06: Lazy-init Resend. process.env.RESEND_API_KEY is UNDEFINED
// inside CF Workers — secrets set via 'wrangler secret put' come through the
// env binding from getCloudflareContext(). Use a memoized lazy getter.
let _resend: Resend | null | undefined = undefined;
let _from: string | undefined = undefined;

async function getMailer(): Promise<{ resend: Resend | null; from: string }> {
  if (_resend !== undefined) {
    return { resend: _resend, from: _from || 'Examanet <onboarding@resend.dev>' };
  }
  let apiKey: string | undefined;
  let fromAddr: string | undefined;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    apiKey = (ctx as any).env?.RESEND_API_KEY;
    fromAddr = (ctx as any).env?.EMAIL_FROM;
  } catch {
    // no CF context (dev)
  }
  if (!apiKey && typeof process !== 'undefined' && process.env?.RESEND_API_KEY) {
    apiKey = process.env.RESEND_API_KEY;
  }
  if (!fromAddr && typeof process !== 'undefined' && process.env?.EMAIL_FROM) {
    fromAddr = process.env.EMAIL_FROM;
  }
  _resend = apiKey ? new Resend(apiKey) : null;
  _from = fromAddr;
  console.log('[admin-notify] Resend initialized:', _resend ? 'YES' : 'NO', 'from:', fromAddr || 'default');
  return { resend: _resend, from: fromAddr || 'Examanet <onboarding@resend.dev>' };
}

/**
 * 2026-09-06: helper that wraps the Resend send and gracefully handles the
 * case where the API key isn't configured (logs and returns null instead of
 * throwing). This is the only place that touches the Resend client.
 */
async function sendEmail(args: {
  from?: string;
  to: string[];
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { resend, from } = await getMailer();
  if (!resend) {
    console.warn('[admin-notify] RESEND_API_KEY not set — skipping email send:', args.subject);
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const result: any = await resend.emails.send({
      from: args.from || from,
      to: args.to,
      subject: args.subject,
      html: args.html,
    });
    if (result?.error) {
      console.error('[admin-notify] Resend error:', result.error);
      return { ok: false, error: String(result.error.message || result.error) };
    }
    console.log('[admin-notify] Email sent:', args.subject, '→', args.to.join(', '));
    return { ok: true };
  } catch (e: any) {
    console.error('[admin-notify] Resend exception:', e?.message || e);
    return { ok: false, error: e?.message || 'unknown' };
  }
}

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 25);
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

async function notifyAdmins(opts: {
  teacherId: string;
  notificationType: string;
  notificationTitle: string;
  notificationMessage: string;
  notificationLink: string;
  emailSubject?: string;
  emailHtml?: string;
  /**
   * Send email to admins. Default: true. Set to false for pre-approved flows
   * (e.g. invited teachers — admin already pre-approved, just wants a quiet
   * in-app notification when the prof joins).
   */
  sendEmail?: boolean;
}) {
  const db = await getD1();
  const shouldSendEmail = opts.sendEmail !== false; // default true

  // Get teacher
  const teacher = await db
    .prepare('SELECT id, role, firstName, lastName, email, schoolName FROM User WHERE id = ? LIMIT 1')
    .bind(opts.teacherId)
    .first();
  if (!teacher || teacher.role !== 'TEACHER') return;

  // Get admins
  const adminsResult = await db
    .prepare("SELECT id, email FROM User WHERE role = 'ADMIN'")
    .all();
  const admins = adminsResult.results || adminsResult;
  if (admins.length === 0) return;

  // In-app notifications
  const now = Date.now();
  for (const admin of admins) {
    await db
      .prepare(
        `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(
        genId(),
        admin.id,
        opts.notificationType,
        opts.notificationTitle,
        opts.notificationMessage,
        opts.notificationLink,
        now,
      )
      .run();
  }

  // Email notifications
  if (!shouldSendEmail || !opts.emailSubject || !opts.emailHtml) return;

  const adminEmails = getAdminEmailsFromConfig();

  try {
    const recipients = new Set<string>(adminEmails);
    for (const admin of admins) {
      if (admin.email) recipients.add(admin.email);
    }
    if (recipients.size === 0) return;
    await sendEmail({
      to: Array.from(recipients),
      subject: opts.emailSubject,
      html: opts.emailHtml,
    });
  } catch (e) {
    console.error('Failed to notify admins:', e);
  }
}

/**
 * Notify all admins that a new teacher has registered and is awaiting approval.
 */
export async function notifyAdminsNewTeacher(teacherId: string) {
  const db = await getD1();
  const teacher = await db
    .prepare('SELECT firstName, lastName, email, schoolName FROM User WHERE id = ? LIMIT 1')
    .bind(teacherId)
    .first();
  if (!teacher) return;

  const html = renderNewTeacherEmail(
    teacher.firstName || '',
    teacher.lastName || '',
    teacher.email,
    teacher.schoolName,
  );

  await notifyAdmins({
    teacherId,
    notificationType: 'new_teacher_pending',
    notificationTitle: '👨‍🏫 Nouveau professeur en attente',
    notificationMessage: `${teacher.firstName || ''} ${teacher.lastName || ''} (${teacher.email}) a postulé comme enseignant.`,
    notificationLink: '/admin/approbations',
    emailSubject: `👨‍🏫 Nouveau professeur à approuver : ${teacher.firstName || ''} ${teacher.lastName || ''}`,
    emailHtml: html,
  });
}

/**
 * Notify all admins that a teacher has verified their email and is now PENDING_APPROVAL.
 */
export async function notifyAdminsTeacherActivated(teacherId: string) {
  const db = await getD1();
  const teacher = await db
    .prepare('SELECT firstName, lastName, email, schoolName FROM User WHERE id = ? LIMIT 1')
    .bind(teacherId)
    .first();
  if (!teacher) return;

  const html = renderTeacherActivatedEmail(
    teacher.firstName || '',
    teacher.lastName || '',
    teacher.email,
  );

  await notifyAdmins({
    teacherId,
    notificationType: 'teacher_activated',
    notificationTitle: '✉️ Professeur a activé son compte',
    notificationMessage: `${teacher.firstName || ''} ${teacher.lastName || ''} (${teacher.email}) a vérifié son email. Compte prêt à être approuvé.`,
    notificationLink: '/admin/approbations',
    emailSubject: `✉️ Professeur activé : ${teacher.firstName || ''} ${teacher.lastName || ''}`,
    emailHtml: html,
  });
}

/**
 * Notify all admins that an invited teacher has activated their account.
 *
 * 2026-09-05: Invited teachers are pre-approved by the admin (the admin
 * explicitly clicked "Invite new teacher" to onboard them). When the
 * teacher activates, the user is set to status='ACTIVE' directly — no
 * approval needed. So the admin gets an in-app notification only, NO
 * email. This avoids the duplicate/contradictory "prêt à être approuvé"
 * email that implied an action that wasn't required.
 */
export async function notifyAdminsInvitedTeacherActivated(teacherId: string) {
  const db = await getD1();
  const teacher = await db
    .prepare('SELECT firstName, lastName, email FROM User WHERE id = ? LIMIT 1')
    .bind(teacherId)
    .first();
  if (!teacher) return;

  const fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'L\'enseignant';
  await notifyAdmins({
    teacherId,
    notificationType: 'invited_teacher_joined',
    notificationTitle: '✅ Professeur invité a rejoint la plateforme',
    notificationMessage: `${fullName} (${teacher.email}) a activé son compte. Vous pouvez consulter ses ressources.`,
    notificationLink: `/admin/professeurs`,
    sendEmail: false, // pre-approved flow → in-app only
  });
}

/**
 * Notify all admins that a new resource has been submitted for review.
 */
export async function notifyAdminsNewResource(resourceId: string, teacherName?: string, resourceTitle?: string) {
  const db = await getD1();
  const adminEmails = getAdminEmailsFromConfig();

  // If teacherName/resourceTitle weren't passed in, fetch from DB so the email
  // body is meaningful (this avoids silent failures when callers forget args,
  // and the previous version called renderNewResourceEmail with subject=undefined
  // which crashed the email send).
  let resolvedTeacherName = teacherName;
  let resolvedResourceTitle = resourceTitle;
  let subjectName: string | null = null;
  if (!resolvedTeacherName || !resolvedResourceTitle) {
    const resource = await db
      .prepare(
        `SELECT r.title as resourceTitle, u.firstName, u.lastName, s.nameFr as subjectName
         FROM Resource r
         LEFT JOIN User u ON r.teacherId = u.id
         LEFT JOIN Subject s ON r.subjectId = s.id
         WHERE r.id = ?
         LIMIT 1`,
      )
      .bind(resourceId)
      .first();
    if (resource) {
      resolvedTeacherName = resolvedTeacherName || `${resource.firstName || ''} ${resource.lastName || ''}`.trim();
      resolvedResourceTitle = resolvedResourceTitle || (resource.resourceTitle as string);
      subjectName = (resource.subjectName as string) || null;
    }
  }
  resolvedTeacherName = resolvedTeacherName || 'Un enseignant';
  resolvedResourceTitle = resolvedResourceTitle || 'une ressource';

  // Get admins
  const adminsResult = await db
    .prepare("SELECT id, email FROM User WHERE role = 'ADMIN'")
    .all();
  const admins = adminsResult.results || adminsResult;
  if (admins.length === 0) return;

  // In-app notifications
  const now = Date.now();
  for (const admin of admins) {
    await db
      .prepare(
        `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt)
         VALUES (?, ?, 'new_resource', ?, ?, '/admin/ressources', 0, ?)`,
      )
      .bind(
        genId(),
        admin.id,
        '📄 Nouvelle ressource à approuver',
        `${resolvedTeacherName} a soumis "${resolvedResourceTitle}" pour approbation.`,
        now,
      )
      .run();
  }

  // Email
  try {
    const html = renderNewResourceEmail(resolvedTeacherName, resolvedResourceTitle, subjectName || '');
    const recipients = new Set<string>(adminEmails);
    for (const admin of admins) {
      if (admin.email) recipients.add(admin.email);
    }
    if (recipients.size === 0) return;
    await sendEmail({
      to: Array.from(recipients),
      subject: `📄 Nouvelle ressource à approuver`,
      html,
    });
  } catch (e) {
    console.error('Failed to notify admins of new resource:', e);
  }
}

/**
 * Notify all admins that a teacher has unpublished their own resource.
 * 2026-09-05: Added for the "teacher can unpublish" feature so admins
 * know the resource is no longer live.
 */
export async function notifyAdminsResourceUnpublished(
  resourceId: string,
  teacherName: string,
  resourceTitle: string,
) {
  const db = await getD1();

  // Get admins
  const adminsResult = await db
    .prepare("SELECT id, email FROM User WHERE role = 'ADMIN'")
    .all();
  const admins = adminsResult.results || adminsResult;
  if (admins.length === 0) return;

  const adminEmails = getAdminEmailsFromConfig();
  const now = Date.now();
  const message = `${teacherName} a dépublié sa ressource « ${resourceTitle} ». Elle n'est plus visible sur la plateforme.`;

  // In-app notifications
  for (const admin of admins) {
    await db
      .prepare(
        `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt)
         VALUES (?, ?, 'resource_unpublished_by_teacher', ?, ?, '/admin/ressources', 0, ?)`,
      )
      .bind(
        genId(),
        admin.id,
        '📥 Ressource dépubliée par un prof',
        message,
        now,
      )
      .run();
  }

  // Email (best-effort)
  try {
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#0F172A;margin:0 0 16px;">📥 Ressource dépubliée</h2>
        <p>Bonjour Admin,</p>
        <p>${message}</p>
        <p style="color:#64748B;font-size:13px;margin-top:24px;">
          La resource est passée en <strong>status=DRAFT</strong> et <strong>isHidden=1</strong>.
          Vous pouvez la consulter ou la remettre en ligne depuis le panneau d'administration.
        </p>
      </div>
    `;
    const recipients = new Set<string>(adminEmails);
    for (const admin of admins) {
      if (admin.email) recipients.add(admin.email);
    }
    if (recipients.size === 0) return;
    await sendEmail({
      to: Array.from(recipients),
      subject: `📥 Ressource dépubliée : ${resourceTitle}`,
      html,
    });
  } catch (e) {
    console.error('Failed to notify admins of resource unpublish:', e);
  }
}

/**
 * 2026-09-06: Notify all admins that a teacher's Office→PDF conversion
 * failed. This is critical because:
 *  - The teacher CANNOT publish resources without a PDF
 *  - The upload was rejected (not just a warning)
 *  - Admins need to know to check iLoveAPI quota / key validity
 *
 * Sends an in-app notification + an email with the error details.
 */
export async function notifyAdminsConversionFailed(opts: {
  teacherId: string;
  fileName: string;
  originalFormat: string;
  errorMessage: string;
  resourceId?: string | null;
}) {
  const db = await getD1();

  // Get teacher
  const teacher: any = await db
    .prepare('SELECT firstName, lastName, email FROM User WHERE id = ? LIMIT 1')
    .bind(opts.teacherId)
    .first();
  if (!teacher) {
    console.warn('[notifyAdminsConversionFailed] teacher not found:', opts.teacherId);
    return;
  }

  // Get admins
  const adminsResult: any = await db
    .prepare("SELECT id, email FROM User WHERE role = 'ADMIN'")
    .all();
  const admins = adminsResult.results || adminsResult;
  if (admins.length === 0) {
    console.warn('[notifyAdminsConversionFailed] no admins found');
    return;
  }

  // In-app notification
  const now = Date.now();
  for (const admin of admins) {
    try {
      await db
        .prepare(
          `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .bind(
          genId(),
          admin.id,
          'conversion_failed',
          '⚠️ Échec de conversion Office → PDF',
          `Le fichier "${opts.fileName}" (${opts.originalFormat.toUpperCase()}) de ${teacher.firstName || ''} ${teacher.lastName || ''} n'a pas pu être converti en PDF. Erreur : ${opts.errorMessage}`,
          opts.resourceId ? '/admin/ressources' : '/admin/fournisseurs',
          now,
        )
        .run();
    } catch (e) {
      console.error('[notifyAdminsConversionFailed] notification insert failed:', e);
    }
  }

  // Email
  try {
    const { renderConversionFailedEmail } = await import('./email-templates');
    const html = renderConversionFailedEmail(
      teacher.firstName || '',
      teacher.lastName || '',
      teacher.email,
      opts.fileName,
      opts.originalFormat,
      opts.errorMessage,
      opts.resourceId || null,
    );
    const adminEmails = await getAdminEmailsFromConfig();
    const recipients = new Set<string>(adminEmails);
    for (const admin of admins) {
      if (admin.email) recipients.add(admin.email);
    }
    if (recipients.size === 0) return;
    await sendEmail({
      to: Array.from(recipients),
      subject: `⚠️ Échec de conversion PDF : ${opts.fileName}`,
      html,
    });
  } catch (e) {
    console.error('[notifyAdminsConversionFailed] email send failed:', e);
  }
}

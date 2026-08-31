// @ts-nocheck
import { Resend } from 'resend';
import { renderNewTeacherEmail, renderNewResourceEmail, renderTeacherActivatedEmail } from './email-templates';
import { getAdminEmailsFromConfig } from './admin-config';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'Examanet <onboarding@resend.dev>';

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
  emailSubject: string;
  emailHtml: string;
}) {
  const db = await getD1();

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
  const adminEmails = getAdminEmailsFromConfig();
  if (!resend) {
    console.log(
      `\n📧 [ADMIN EMAIL - DEV] ${opts.emailSubject} → ${adminEmails.join(', ')}\n`,
    );
    return;
  }

  try {
    const recipients = new Set<string>(adminEmails);
    for (const admin of admins) {
      if (admin.email) recipients.add(admin.email);
    }
    if (recipients.size === 0) return;
    await resend.emails.send({
      from: FROM,
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
 */
export async function notifyAdminsInvitedTeacherActivated(teacherId: string) {
  // Same flow as notifyAdminsTeacherActivated for now
  return notifyAdminsTeacherActivated(teacherId);
}

/**
 * Notify all admins that a new resource has been submitted for review.
 */
export async function notifyAdminsNewResource(resourceId: string, teacherName?: string, resourceTitle?: string) {
  const db = await getD1();
  const adminEmails = getAdminEmailsFromConfig();

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
        `${teacherName || 'Un enseignant'} a soumis "${resourceTitle || 'une ressource'}" pour approbation.`,
        now,
      )
      .run();
  }

  // Email
  if (!resend) {
    console.log(`\n📧 [ADMIN EMAIL - DEV] New resource → ${adminEmails.join(', ')}\n`);
    return;
  }

  try {
    const html = renderNewResourceEmail(teacherName || '', resourceTitle || '');
    const recipients = new Set<string>(adminEmails);
    for (const admin of admins) {
      if (admin.email) recipients.add(admin.email);
    }
    if (recipients.size === 0) return;
    await resend.emails.send({
      from: FROM,
      to: Array.from(recipients),
      subject: `📄 Nouvelle ressource à approuver`,
      html,
    });
  } catch (e) {
    console.error('Failed to notify admins of new resource:', e);
  }
}

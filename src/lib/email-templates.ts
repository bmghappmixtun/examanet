// Templates additionnels pour notifications admin
import {
  renderEmailShell,
  EMAIL_FONT_STACK,
  paragraph,
  muted,
  ctaButton,
  infoCard,
} from './email-shell';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
const F = EMAIL_FONT_STACK;

export function renderNewTeacherEmail(
  firstName: string,
  lastName: string,
  email: string,
  school: string | null,
): string {
  const safeSchool = school ? school.replace(/</g, '&lt;').replace(/>/g, '&gt;') : null;
  return renderEmailShell({
    accent: 'amber',
    icon: '👨‍🏫',
    title: 'Nouveau professeur en attente',
    subtitle: 'Un enseignant attend votre approbation',
    preheader: `Inscription de ${firstName} ${lastName}`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;color:#0F172A;font-family:${F};">Bonjour Admin,</p>
      ${paragraph("Un nouvel enseignant vient de s'inscrire sur Examanet et attend votre approbation.")}
      <div style="background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:8px;padding:16px;margin:20px 0;font-family:${F};">
        <p style="margin:0 0 8px;color:#92400E;font-weight:bold;">📋 Informations du compte</p>
        <p style="margin:4px 0;color:#78350F;font-size:14px;"><strong>Nom :</strong> ${firstName} ${lastName}</p>
        <p style="margin:4px 0;color:#78350F;font-size:14px;"><strong>Email :</strong> <a href="mailto:${email}" style="color:#0369A1;">${email}</a></p>
        ${safeSchool ? `<p style="margin:4px 0;color:#78350F;font-size:14px;"><strong>Établissement :</strong> ${safeSchool}</p>` : ''}
      </div>
      ${muted('Connectez-vous à votre dashboard admin pour examiner et approuver ce compte.')}
      ${ctaButton(`${SITE_URL}/admin/approbations`, 'Voir les approbations', 'amber')}
    `,
    footer: `<p style="margin:0;color:#94A3B8;font-size:12px;text-align:center;font-family:${F};">Examanet · Système de notification admin</p>`,
  });
}

/**
 * Email sent to admin when a teacher verifies their email (PENDING_OTP → PENDING_APPROVAL).
 * Distinct from `renderNewTeacherEmail` (which is sent at signup when the prof is PENDING_OTP).
 * This confirms the prof has indeed activated their account and the email is valid.
 */
export function renderTeacherActivatedEmail(
  firstName: string,
  lastName: string,
  email: string,
  school: string | null,
): string {
  const safeSchool = school ? school.replace(/</g, '&lt;').replace(/>/g, '&gt;') : null;
  return renderEmailShell({
    accent: 'green',
    icon: '✉️',
    title: 'Professeur a activé son compte',
    subtitle: 'Email vérifié — prêt à être approuvé',
    preheader: `${firstName} ${lastName} a vérifié son email`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;color:#0F172A;font-family:${F};">Bonjour Admin,</p>
      ${paragraph(
        `L'enseignant <strong style="color:#0F172A;">${firstName} ${lastName}</strong> a vérifié son adresse email et son compte est maintenant en attente d'approbation.`,
      )}
      <div style="background:#D1FAE5;border-left:4px solid #10B981;border-radius:8px;padding:16px;margin:20px 0;font-family:${F};">
        <p style="margin:0 0 8px;color:#065F46;font-weight:bold;">✅ Email confirmé</p>
        <p style="margin:4px 0;color:#064E3B;font-size:14px;"><strong>Nom :</strong> ${firstName} ${lastName}</p>
        <p style="margin:4px 0;color:#064E3B;font-size:14px;"><strong>Email :</strong> <a href="mailto:${email}" style="color:#0369A1;">${email}</a></p>
        ${safeSchool ? `<p style="margin:4px 0;color:#064E3B;font-size:14px;"><strong>Établissement :</strong> ${safeSchool}</p>` : ''}
      </div>
      ${muted("Le prof a confirmé son adresse email — vous pouvez maintenant examiner et approuver son compte.")}
      ${ctaButton(`${SITE_URL}/admin/approbations`, 'Approuver le professeur', 'green')}
    `,
    footer: `<p style="margin:0;color:#94A3B8;font-size:12px;text-align:center;font-family:${F};">Examanet · Système de notification admin</p>`,
  });
}

export function renderNewResourceEmail(
  teacherName: string,
  title: string,
  subject: string,
): string {
  const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeSubject = subject.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTeacher = teacherName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return renderEmailShell({
    accent: 'blue',
    icon: '📄',
    title: 'Nouvelle ressource à valider',
    subtitle: 'Un enseignant attend votre approbation',
    preheader: `Ressource: ${safeTitle}`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;color:#0F172A;font-family:${F};">Bonjour Admin,</p>
      ${paragraph('Un enseignant a soumis une nouvelle ressource qui attend votre approbation.')}
      <div style="background:#DBEAFE;border-left:4px solid #3B82F6;border-radius:8px;padding:16px;margin:20px 0;font-family:${F};">
        <p style="margin:0 0 8px;color:#1E40AF;font-weight:bold;">📚 Détails</p>
        <p style="margin:4px 0;color:#1E3A8A;font-size:14px;"><strong>Titre :</strong> ${safeTitle}</p>
        <p style="margin:4px 0;color:#1E3A8A;font-size:14px;"><strong>Matière :</strong> ${safeSubject}</p>
        <p style="margin:4px 0;color:#1E3A8A;font-size:14px;"><strong>Enseignant :</strong> ${safeTeacher}</p>
      </div>
      ${ctaButton(`${SITE_URL}/admin/approbations`, 'Examiner la ressource', 'blue')}
    `,
  });
}

export function renderResourceRejectedEmail(
  firstName: string,
  resourceTitle: string,
  reason: string,
  resourceUrl?: string,
): string {
  const safeReason = (reason || 'Aucun motif fourni').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTitle = resourceTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return renderEmailShell({
    accent: 'red',
    icon: '❌',
    title: 'Ressource non validée',
    subtitle: 'Votre demande nécessite des corrections',
    preheader: `Refusée : ${safeTitle.slice(0, 60)}`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;color:#0F172A;font-family:${F};">Bonjour <strong style="color:#0F172A;">${firstName}</strong>,</p>
      ${paragraph("Après examen, votre ressource n'a malheureusement pas pu être validée en l'état. Pas d'inquiétude, c'est tout à fait réversible !")}
      ${infoCard('Ressource concernée', safeTitle, 'red')}
      <div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:0 12px 12px 0;padding:20px;margin:0 0 24px;font-family:${F};">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#B91C1C;margin-bottom:8px;">💬 Motif du refus</div>
        <div style="color:#7F1D1D;font-size:14px;line-height:1.6;font-style:italic;border-left:2px solid rgba(239,68,68,0.2);padding-left:12px;">${safeReason}</div>
      </div>
      ${resourceUrl ? ctaButton(resourceUrl, 'Voir la ressource', 'blue') : ''}
      <div style="background:linear-gradient(135deg,#F0F9FF 0%,#E0F2FE 100%);border:1px solid #BAE6FD;border-radius:12px;padding:18px;margin:0 0 16px;font-family:${F};">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0369A1;margin-bottom:8px;">💡 Et maintenant ?</div>
        <ul style="margin:0;padding-left:20px;color:#0F172A;font-size:14px;line-height:1.7;">
          <li>Relisez attentivement le motif ci-dessus</li>
          <li>Corrigez votre fichier en conséquence</li>
          <li>Soumettez à nouveau votre ressource</li>
        </ul>
      </div>
      ${muted("Besoin d'aide ? Répondez simplement à cet email, notre équipe vous accompagnera volontiers.")}
    `,
  });
}

export function renderEditApprovedEmail(
  firstName: string,
  resourceTitle: string,
  resourceUrl: string,
): string {
  const safeTitle = resourceTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return renderEmailShell({
    accent: 'green',
    icon: '✅',
    title: 'Modification approuvée',
    subtitle: 'Vos changements sont en ligne',
    preheader: `Approuvée : ${safeTitle.slice(0, 60)}`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;color:#0F172A;font-family:${F};">Bonjour <strong style="color:#0F172A;">${firstName}</strong>,</p>
      ${paragraph('Excellente nouvelle ! La modification que vous avez soumise pour la ressource ci-dessous a été approuvée par notre équipe et est désormais en ligne sur Examanet.')}
      ${infoCard('Ressource modifiée', safeTitle, 'green')}
      ${ctaButton(resourceUrl, 'Voir la version mise à jour →', 'green')}
      ${muted('Merci pour votre contribution à améliorer Examanet ! Vos modifications aident les élèves tunisiens à apprendre plus efficacement.')}
    `,
  });
}

export function renderEditRejectedEmail(
  firstName: string,
  resourceTitle: string,
  reason: string,
  resourceUrl: string,
): string {
  const safeTitle = resourceTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeReason = (reason || 'Aucun motif fourni').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return renderEmailShell({
    accent: 'red',
    icon: '📝',
    title: 'Modification refusée',
    subtitle: 'Votre demande nécessite des corrections',
    preheader: `Refusée : ${safeTitle.slice(0, 60)}`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;color:#0F172A;font-family:${F};">Bonjour <strong style="color:#0F172A;">${firstName}</strong>,</p>
      ${paragraph("Après examen, la modification que vous avez soumise pour la ressource ci-dessous n'a malheureusement pas pu être validée en l'état. Pas d'inquiétude, c'est tout à fait réversible !")}
      ${infoCard('Ressource concernée', safeTitle, 'red')}
      <div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:0 12px 12px 0;padding:20px;margin:0 0 24px;font-family:${F};">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#B91C1C;margin-bottom:8px;">💬 Motif du refus</div>
        <div style="color:#7F1D1D;font-size:14px;line-height:1.6;font-style:italic;border-left:2px solid rgba(239,68,68,0.2);padding-left:12px;">${safeReason}</div>
      </div>
      ${ctaButton(resourceUrl, 'Voir la ressource', 'blue')}
      <div style="background:linear-gradient(135deg,#F0F9FF 0%,#E0F2FE 100%);border:1px solid #BAE6FD;border-radius:12px;padding:18px;margin:0 0 16px;font-family:${F};">
        <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0369A1;margin-bottom:8px;">💡 Et maintenant ?</div>
        <ul style="margin:0;padding-left:20px;color:#0F172A;font-size:14px;line-height:1.7;">
          <li>Relisez attentivement le motif ci-dessus</li>
          <li>Soumettez à nouveau une nouvelle modification</li>
          <li>Le contenu original est conservé (modification annulée)</li>
        </ul>
      </div>
      ${muted("Besoin d'aide ? Répondez simplement à cet email, notre équipe vous accompagnera volontiers.")}
    `,
  });
}

export function renderNewEditPendingEmail(
  teacherName: string,
  resourceTitle: string,
  editSummary: string,
  resourceUrl: string,
  wasPreviouslyRejected: boolean,
  previousRejectionReason?: string,
): string {
  const safeTitle = resourceTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeSummary = (editSummary || 'modification').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTeacher = teacherName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safePrevReason = (previousRejectionReason || '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return renderEmailShell({
    accent: 'blue',
    icon: wasPreviouslyRejected ? '🔄' : '✏️',
    title: wasPreviouslyRejected ? 'Nouvelle soumission à valider' : 'Modification à valider',
    subtitle: wasPreviouslyRejected
      ? 'Le prof a corrigé et re-soumis sa modification'
      : 'Un enseignant a soumis une modification',
    preheader: `${safeTeacher} - ${safeTitle.slice(0, 50)}`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;color:#0F172A;font-family:${F};">Bonjour Admin,</p>
      ${paragraph(
        wasPreviouslyRejected
          ? `L'enseignant <strong style="color:#0F172A;">${safeTeacher}</strong> a corrigé sa modification suite à votre refus et l'a re-soumise pour validation.`
          : `L'enseignant <strong style="color:#0F172A;">${safeTeacher}</strong> a soumis une modification sur la ressource ci-dessous.`,
      )}

      ${
        wasPreviouslyRejected && safePrevReason
          ? `
      <div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:0 12px 12px 0;padding:16px;margin:0 0 16px;font-family:${F};">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#B91C1C;margin-bottom:6px;">⚠️ Motif du refus précédent</div>
        <div style="color:#7F1D1D;font-size:13px;line-height:1.5;font-style:italic;">${safePrevReason}</div>
      </div>
      `
          : ''
      }

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:18px 20px;margin:0 0 16px;font-family:${F};">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#3B82F6;margin-bottom:6px;">Ressource modifiée</div>
        <div style="font-weight:600;color:#0F172A;font-size:15px;line-height:1.5;word-break:break-word;">${safeTitle}</div>
        <div style="font-size:12px;color:#64748B;margin-top:6px;">📝 ${safeSummary}</div>
      </div>

      ${ctaButton(resourceUrl, 'Examiner la modification →', 'blue')}
    `,
  });
}

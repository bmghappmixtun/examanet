/**
 * Send all platform emails to a single address for visual testing.
 * Usage: TO_EMAIL=boutiti.mehdi@gmail.com npx tsx scripts/one-off/send-all-emails.mts
 */
import {
  sendOTPEmail,
  sendWelcomeEmail,
  sendWelcomeConfirmedEmail,
  sendContactEmail,
  sendTeacherApprovalEmail,
  sendAdminVerificationFilesEmail,
  sendTeacherFileRequestEmail,
  sendResourceApprovedEmail,
  sendResourceRejectedEmail,
  sendEditApprovedEmail,
  sendEditRejectedEmail,
  sendNewEditPendingEmail,
  sendPasswordChangedEmail,
} from '../../src/lib/email.ts';
import {
  renderNewTeacherEmail,
  renderNewResourceEmail,
} from '../../src/lib/email-templates.ts';

const TO = process.env.TO_EMAIL || 'boutiti.mehdi@gmail.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Examanet <noreply@examanet.com>';

if (!RESEND_API_KEY) {
  console.error('RESEND_API_KEY missing in env');
  process.exit(1);
}

// Direct send via Resend (bypass our senders for speed)
async function sendDirect(subject: string, html: string, to: string = TO) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Resend ${r.status}: ${text}`);
  }
  return JSON.parse(text);
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;

// Sample data
const SAMPLE = {
  firstName: 'Mehdi',
  lastName: 'Boutiti',
  role: 'TEACHER',
  code: '482917',
  resourceTitle: 'Devoir de Synthèse N°3 - Histoire-Géographie - 9ème année (Collège) - 2025-2026',
  resourceUrl: `${SITE_URL}/ressources/15333/devoir-synthese-3-9eme-histoire-geographie`,
  reason: 'Le contenu ne respecte pas les CGU d\'Examanet. Merci de reformuler et de soumettre à nouveau avec une formulation respectueuse et conforme au programme officiel.',
  editSummary: 'Correction des coquilles et ajout d\'exercices sur la Guerre froide',
  school: 'Lycée pilote de Tunis',
  subject: 'Histoire-Géographie',
  ip: '41.225.10.42',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  teacherName: 'Sami Trabelsi',
  teacherEmail: 'sami.trabelsi@gmail.com',
  previousRejectionReason: 'Format incorrect, merci de respecter le template officiel Examanet',
};

const results: Array<{ name: string; subject: string; id?: string; error?: string }> = [];

async function safeSend(name: string, subject: string, sendFn: () => Promise<any>) {
  try {
    const r = await sendFn();
    results.push({ name, subject, id: r?.id || r?.data?.id });
    console.log(`✓ ${name}`);
  } catch (e: any) {
    results.push({ name, subject, error: e?.message });
    console.log(`✗ ${name}: ${e?.message}`);
  }
  // Small delay to avoid Resend rate limit
  await new Promise(r => setTimeout(r, 200));
}

console.log(`\n📧 Sending all 17 emails to: ${TO}\n`);

// 1. OTP code
await safeSend('1. OTP code (inscription)', 'Vérifiez votre email - Examanet', () =>
  sendOTPEmail(TO, SAMPLE.code, SAMPLE.firstName)
);

// 2. Welcome
await safeSend('2. Welcome (compte créé)', 'Bienvenue sur Examanet !', () =>
  sendWelcomeEmail(TO, SAMPLE.firstName, SAMPLE.role)
);

// 3. Welcome confirmed
await safeSend('3. Welcome confirmed (email vérifié)', 'Compte Examanet activé !', () =>
  sendWelcomeConfirmedEmail(TO, SAMPLE.firstName, SAMPLE.role)
);

// 4. Contact (admin)
await safeSend('4. Contact (notification admin)', 'Contact: Question sur les CGU', () =>
  sendContactEmail({
    name: 'Ahmed Ben Ali',
    email: 'ahmed.benali@gmail.com',
    subject: 'Question sur les CGU',
    message: 'Bonjour,\n\nJe voulais savoir si je peux utiliser les ressources d\'Examanet pour mes cours particuliers payants.\n\nMerci d\'avance pour votre réponse.\n\nCordialement,\nAhmed',
  })
);

// 5. Teacher approved
await safeSend('5. Teacher approved (profil validé)', 'Bienvenue dans l\'équipe ! - Examanet', () =>
  sendTeacherApprovalEmail(TO, SAMPLE.firstName, true, {
    lastName: SAMPLE.lastName,
    dashboardUrl: `${SITE_URL}/enseignant`,
    subjects: ['Mathématiques', 'Physique-Chimie'],
    level: 'lycee',
  })
);

// 6. Teacher rejected
await safeSend('6. Teacher rejected (profil refusé)', 'Demande non retenue - Examanet', () =>
  sendTeacherApprovalEmail(TO, SAMPLE.firstName, false)
);

// 7. Admin verification files
await safeSend('7. Admin verification files', 'Fichier à vérifier - Examanet', () =>
  sendAdminVerificationFilesEmail({
    to: TO,
    teacherName: SAMPLE.teacherName,
    teacherEmail: SAMPLE.teacherEmail,
    resourceTitle: SAMPLE.resourceTitle,
    resourceId: 12345,
    reviewUrl: `${SITE_URL}/admin/verification-files`,
  })
);

// 8. Teacher file request
await safeSend('8. Teacher file request', 'Fichiers de vérification requis - Examanet', () =>
  sendTeacherFileRequestEmail({
    to: TO,
    firstName: SAMPLE.firstName,
    requestUrl: `${SITE_URL}/enseignant/verification-files`,
    notes: 'Merci d\'uploader votre carte d\'identité et un justificatif d\'exercice récent.',
  })
);

// 9. Resource approved
await safeSend('9. Resource approved', '✓ Votre ressource est en ligne - Examanet', () =>
  sendResourceApprovedEmail(TO, SAMPLE.firstName, SAMPLE.resourceTitle, true, SAMPLE.resourceUrl.replace(SITE_URL, ''))
);

// 10. Resource rejected
await safeSend('10. Resource rejected', 'Ressource non retenue - Examanet', () =>
  sendResourceRejectedEmail(TO, SAMPLE.firstName, SAMPLE.resourceTitle, SAMPLE.reason, SAMPLE.resourceUrl.replace(SITE_URL, ''))
);

// 11. Edit approved
await safeSend('11. Edit approved', 'Modification approuvée - Examanet', () =>
  sendEditApprovedEmail(TO, SAMPLE.firstName, SAMPLE.resourceTitle, SAMPLE.resourceUrl.replace(SITE_URL, ''))
);

// 12. Edit rejected
await safeSend('12. Edit rejected', 'Modification refusée - Examanet', () =>
  sendEditRejectedEmail(TO, SAMPLE.firstName, SAMPLE.resourceTitle, SAMPLE.reason, SAMPLE.resourceUrl.replace(SITE_URL, ''))
);

// 13. New edit pending
await safeSend('13. New edit pending', 'Modification à valider - Examanet', () =>
  sendNewEditPendingEmail(TO, SAMPLE.teacherName, SAMPLE.resourceTitle, SAMPLE.editSummary, SAMPLE.resourceUrl.replace(SITE_URL, ''), true, SAMPLE.previousRejectionReason)
);

// 14. Password changed
await safeSend('14. Password changed', 'Mot de passe modifié - Examanet', () =>
  sendPasswordChangedEmail({
    to: TO,
    firstName: SAMPLE.firstName,
    ip: SAMPLE.ip,
    userAgent: SAMPLE.userAgent,
  })
);

// 15-17. Direct via Resend (admin templates not in senders list)
const directEmails = [
  {
    name: '15. New teacher (admin notification)',
    subject: '👨‍🏫 Nouveau professeur en attente - Examanet',
    html: renderNewTeacherEmail(SAMPLE.teacherName.split(' ')[0], SAMPLE.teacherName.split(' ')[1] || 'Trabelsi', SAMPLE.teacherEmail, SAMPLE.school),
  },
  {
    name: '16. New resource (admin notification)',
    subject: '📄 Nouvelle ressource à valider - Examanet',
    html: renderNewResourceEmail(SAMPLE.teacherName, SAMPLE.resourceTitle, SAMPLE.subject),
  },
  {
    name: '17. Resource rejected (avec motif)',
    subject: '❌ Ressource non validée - Examanet',
    html: (await import('../../src/lib/email-templates.ts')).renderResourceRejectedEmail(SAMPLE.firstName, SAMPLE.resourceTitle, SAMPLE.reason, SAMPLE.resourceUrl),
  },
];

for (const e of directEmails) {
  try {
    const r = await sendDirect(e.subject, e.html);
    results.push({ name: e.name, subject: e.subject, id: r.id });
    console.log(`✓ ${e.name}`);
  } catch (err: any) {
    results.push({ name: e.name, subject: e.subject, error: err.message });
    console.log(`✗ ${e.name}: ${err.message}`);
  }
  await new Promise(r => setTimeout(r, 200));
}

console.log(`\n=== Summary ===`);
const ok = results.filter(r => r.id).length;
const failed = results.filter(r => r.error).length;
console.log(`${ok}/${results.length} sent successfully${failed ? `, ${failed} failed` : ''}`);
console.log(`\nTo: ${TO}`);

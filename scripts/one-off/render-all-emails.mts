/**
 * Render all platform emails to standalone HTML files for visual testing.
 * Run with: npx tsx scripts/one-off/render-all-emails.mts
 */
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const OUT_DIR = '/workspace/docs/email-previews';
const SITE_URL = 'https://examanet.com';

// Set env so emails render correctly
process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
process.env.NODE_ENV = 'production';

// Import all render functions
const email = await import('../../src/lib/email.ts');
const tpl = await import('../../src/lib/email-templates.ts');

await mkdir(OUT_DIR, { recursive: true });

const samples: Array<{ name: string; filename: string; html: string; description: string; triggeredBy: string }> = [];

function addSample(name: string, description: string, html: string, triggeredBy: string) {
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  samples.push({ name, filename: `${safeName}.html`, html, description, triggeredBy });
}

// =================================================================
// 1. OTP code (inscription, reset password)
// =================================================================
addSample(
  '1. OTP code (inscription)',
  'Code de vérification 6 chiffres envoyé à l\'utilisateur lors de l\'inscription ou du reset password.',
  email.renderOTPEmail?.('482917', 'Test') ?? '',
  'POST /api/auth/register, /api/password/forgot'
);

// =================================================================
// 2. Welcome email (compte créé)
// =================================================================
addSample(
  '2. Welcome (compte créé)',
  'Email envoyé juste après la création du compte, avant vérification OTP.',
  email.renderWelcomeEmail?.('Test', 'TEACHER') ?? '',
  'POST /api/auth/register'
);

// =================================================================
// 3. Welcome confirmed (email vérifié)
// =================================================================
addSample(
  '3. Welcome confirmed (email vérifié)',
  'Email envoyé après vérification du code OTP, confirme que le compte est actif.',
  email.renderWelcomeConfirmedEmail?.('Test', 'TEACHER') ?? '',
  'POST /api/auth/verify-otp'
);

// =================================================================
// 4. Contact (admin notification)
// =================================================================
addSample(
  '4. Contact (notification admin)',
  'Email envoyé à l\'admin quand un utilisateur remplit le formulaire de contact.',
  email.renderContactEmail?.({
    name: 'Ahmed Ben Ali',
    email: 'ahmed.benali@gmail.com',
    subject: 'Question sur les CGU',
    message: 'Bonjour,\n\nJe voulais savoir si je peux utiliser les ressources d\'Examanet pour mes cours particuliers payants.\n\nMerci d\'avance pour votre réponse.\n\nCordialement,\nAhmed',
  }) ?? '',
  'POST /api/contact'
);

// =================================================================
// 5. Teacher approved
// =================================================================
addSample(
  '5. Teacher approved (profil validé)',
  'Email envoyé quand l\'admin approuve un compte enseignant.',
  email.renderTeacherApprovalEmail?.('Test', true, {
    lastName: 'Enseignant',
    dashboardUrl: 'https://examanet.com/enseignant',
    subjects: ['Mathématiques', 'Physique-Chimie'],
    level: 'lycee',
  }) ?? '',
  'POST /api/admin/teacher/{id}/{action} (action=approve)'
);

// =================================================================
// 6. Teacher rejected
// =================================================================
addSample(
  '6. Teacher rejected (profil refusé)',
  'Email envoyé quand l\'admin refuse un compte enseignant.',
  email.renderTeacherApprovalEmail?.('Test', false) ?? '',
  'POST /api/admin/teacher/{id}/{action} (action=reject)'
);

// =================================================================
// 7. Admin verification files
// =================================================================
addSample(
  '7. Admin verification files (à examiner)',
  'Email envoyé à l\'admin quand un prof upload ses fichiers de vérification.',
  email.renderAdminVerificationFilesEmail?.({
    teacherName: 'Sami Trabelsi',
    teacherEmail: 'sami.trabelsi@gmail.com',
    resourceTitle: 'Devoir de Contrôle N°2 - Math - 3ème année (2025-2026)',
    resourceId: 12345,
    reviewUrl: 'https://examanet.com/admin/verification-files',
  }) ?? '',
  'POST /api/teacher/verification-files'
);

// =================================================================
// 8. Teacher file request (admin demande fichiers)
// =================================================================
addSample(
  '8. Teacher file request (admin demande fichiers)',
  'Email envoyé au prof quand l\'admin lui demande d\'uploader ses fichiers de vérification.',
  email.renderTeacherFileRequestEmail?.({
    firstName: 'Test',
    requestUrl: 'https://examanet.com/enseignant/verification-files',
    notes: 'Merci d\'uploader votre carte d\'identité et un justificatif d\'exercice récent.',
  }) ?? '',
  'POST /api/admin/teacher/{id}/request-files'
);

// =================================================================
// 9. Resource approved
// =================================================================
addSample(
  '9. Resource approved (ressource publiée)',
  'Email envoyé au prof quand l\'admin approuve sa ressource.',
  email.renderResourceApprovedEmail?.(
    'Test',
    'Devoir de Synthèse N°3 - Histoire-Géographie - 9ème année (Collège) - 2025-2026',
    true,
    '/ressources/15333/devoir-synthese-3-9eme-histoire-geographie'
  ) ?? '',
  'POST /api/admin/resource/{id}/{action} (action=approve)'
);

// =================================================================
// 10. Resource rejected
// =================================================================
addSample(
  '10. Resource rejected (refusée)',
  'Email envoyé au prof quand l\'admin refuse sa ressource.',
  email.renderResourceApprovedEmail?.(
    'Test',
    'Devoir de Mathématiques - 3ème année (2025-2026)',
    false
  ) ?? '',
  'POST /api/admin/resource/{id}/{action} (action=reject)'
);

// =================================================================
// 11. Password changed (forgot-password)
// =================================================================
addSample(
  '11. Password changed (forgot-password)',
  'Email envoyé après un changement de mot de passe via /mot-de-passe-oublie.',
  email.renderPasswordChangedEmail?.({
    firstName: 'Test',
    ip: '41.225.10.42',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  }) ?? '',
  'POST /api/password/reset'
);

// =================================================================
// 12. New teacher (admin notification)
// =================================================================
addSample(
  '12. New teacher (admin notification)',
  'Email envoyé aux admins quand un nouvel enseignant s\'inscrit.',
  tpl.renderNewTeacherEmail?.('Sami', 'Trabelsi', 'sami.trabelsi@gmail.com', 'Lycée pilote de Tunis') ?? '',
  'POST /api/auth/register (role=TEACHER)'
);

// =================================================================
// 13. New resource (admin notification)
// =================================================================
addSample(
  '13. New resource (admin notification)',
  'Email envoyé aux admins quand une nouvelle ressource est soumise.',
  tpl.renderNewResourceEmail?.(
    'Sami Trabelsi',
    'Devoir de Contrôle N°2 - Math - 3ème année (2025-2026)',
    'Mathématiques'
  ) ?? '',
  'POST /api/teacher/resources'
);

// =================================================================
// 14. Resource rejected (with reason)
// =================================================================
addSample(
  '14. Resource rejected (avec motif)',
  'Email détaillé envoyé au prof avec le motif de refus (depuis /api/admin/resource/[id]/[action]).',
  tpl.renderResourceRejectedEmail?.(
    'Test',
    'Devoir de Mathématiques - 3ème année (2025-2026)',
    'Le contenu ne respecte pas les CGU d\'Examanet. Merci de reformuler et de soumettre à nouveau avec une formulation respectueuse et conforme au programme officiel.',
    'https://examanet.com/ressources/15333/devoir-math-3eme'
  ) ?? '',
  'POST /api/admin/resource/{id}/{action} (action=reject)'
);

// =================================================================
// 15. Edit approved
// =================================================================
addSample(
  '15. Edit approved (modification approuvée)',
  'Email envoyé au prof quand l\'admin approuve sa modification de ressource.',
  tpl.renderEditApprovedEmail?.(
    'Test',
    'Devoir de Mathématiques - 3ème année (2025-2026)',
    'https://examanet.com/ressources/15333/devoir-math-3eme'
  ) ?? '',
  'POST /api/admin/resource/{id}/edit (action=approve)'
);

// =================================================================
// 16. Edit rejected
// =================================================================
addSample(
  '16. Edit rejected (modification refusée)',
  'Email envoyé au prof quand l\'admin refuse sa modification de ressource.',
  tpl.renderEditRejectedEmail?.(
    'Test',
    'Devoir de Mathématiques - 3ème année (2025-2026)',
    'L\'amélioration proposée ne couvre pas les points demandés. Merci de reformuler en tenant compte du motif précédent.',
    'https://examanet.com/ressources/15333/devoir-math-3eme'
  ) ?? '',
  'POST /api/admin/resource/{id}/edit (action=reject)'
);

// =================================================================
// 17. New edit pending (admin notification)
// =================================================================
addSample(
  '17. New edit pending (admin notification)',
  'Email envoyé aux admins quand un prof soumet une modification (première fois ou re-soumission).',
  tpl.renderNewEditPendingEmail?.(
    'Sami Trabelsi',
    'Devoir de Mathématiques - 3ème année (2025-2026)',
    'Correction des coquilles et ajout d\'exercices sur les fonctions dérivées',
    'https://examanet.com/admin/approbations',
    true,
    'Format incorrect, merci de respecter le template officiel Examanet'
  ) ?? '',
  'POST /api/teacher/resources/{id}'
);

// =================================================================
// Write all files
// =================================================================
console.log(`Rendering ${samples.length} emails to ${OUT_DIR}\n`);
for (const sample of samples) {
  const filepath = join(OUT_DIR, sample.filename);
  await writeFile(filepath, sample.html, 'utf8');
  console.log(`✓ ${sample.filename} (${sample.html.length} bytes)`);
  console.log(`    ${sample.description}`);
}

// =================================================================
// Generate an index.html
// =================================================================
const indexHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Examanet - Email Previews</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F1F5F9; padding: 32px 16px; }
    h1 { color: #0F172A; font-size: 32px; margin-bottom: 8px; text-align: center; }
    .subtitle { color: #64748B; font-size: 15px; text-align: center; margin-bottom: 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; max-width: 1400px; margin: 0 auto; }
    .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15,23,42,0.06); border: 1px solid #E2E8F0; display: flex; flex-direction: column; }
    .card-header { padding: 16px 20px; border-bottom: 1px solid #E2E8F0; background: #F8FAFC; }
    .card-title { color: #0F172A; font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .card-desc { color: #64748B; font-size: 12px; line-height: 1.5; margin-bottom: 8px; }
    .card-trigger { color: #94A3B8; font-size: 11px; font-family: monospace; padding: 4px 8px; background: #0F172A; color: #F1F5F9; border-radius: 4px; display: inline-block; }
    .card-body { flex: 1; min-height: 400px; max-height: 600px; overflow: hidden; }
    .card-body iframe { width: 100%; height: 100%; border: none; }
    .card-footer { padding: 12px 20px; background: #F8FAFC; border-top: 1px solid #E2E8F0; display: flex; gap: 8px; }
    .card-footer a { flex: 1; padding: 8px 12px; text-align: center; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600; transition: all 0.2s; }
    .btn-open { background: #3B82F6; color: white; }
    .btn-open:hover { background: #2563EB; }
    .btn-download { background: #10B981; color: white; }
    .btn-download:hover { background: #059669; }
  </style>
</head>
<body>
  <h1>📧 Examanet — Email Previews</h1>
  <p class="subtitle">${samples.length} emails used in the platform · Generated for visual testing</p>
  <div class="grid">
    ${samples.map(s => `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${s.name}</div>
        <div class="card-desc">${s.description}</div>
        <span class="card-trigger">${s.triggeredBy}</span>
      </div>
      <div class="card-body">
        <iframe src="${s.filename}" sandbox="allow-same-origin"></iframe>
      </div>
      <div class="card-footer">
        <a href="${s.filename}" target="_blank" class="btn-open">Open fullscreen</a>
        <a href="${s.filename}" download class="btn-download">Download .html</a>
      </div>
    </div>
    `).join('')}
  </div>
</body>
</html>`;
await writeFile(join(OUT_DIR, 'index.html'), indexHtml, 'utf8');
console.log(`\n✓ index.html generated`);

console.log(`\n→ Open /workspace/docs/email-previews/index.html in a browser`);

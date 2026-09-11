// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import VerificationFilesUploader from '@/components/teacher/VerificationFilesUploader';
import { Shield, Clock, CheckCircle2 } from 'lucide-react';
import { sendTeacherFileRequestEmail } from '@/lib/email';
import { genId } from '@/lib/db-d1';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Vérification du compte enseignant',
  robots: { index: false, follow: false },
};

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export default async function VerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') redirect('/');

  const db = await getD1();
  if (!db) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <p className="text-slate-600">DB indisponible, réessayez plus tard.</p>
      </div>
    );
  }

  const teacher: any = await db
    .prepare(
      `SELECT id, status, firstName, lastName, email, schoolName, governorate,
              verificationFilesRequestedAt, verificationFilesReceivedAt,
              verificationFilesNote, isVerifiedTeacher, verifiedAt
       FROM User WHERE id = ?`,
    )
    .bind(user.id)
    .first();

  if (!teacher) redirect('/connexion');

  // Already verified? Redirect to dashboard with celebration
  if (teacher.status === 'ACTIVE' && teacher.isVerifiedTeacher) {
    redirect('/enseignant?verified=1');
  }

  // 2026-09-11: If teacher is PENDING_APPROVAL with complete profile (e.g.
  // they finished the form before our auto-trigger was deployed), trigger
  // the file verification request now.
  if (teacher.status === 'PENDING_APPROVAL') {
    const profileComplete = teacher.firstName && teacher.lastName && teacher.schoolName && teacher.governorate;
    if (profileComplete) {
      const now = Date.now();
      await db
        .prepare(
          `UPDATE User SET status = 'PENDING_FILE_VERIFICATION',
                  verificationFilesRequestedAt = ?,
                  updatedAt = ?
           WHERE id = ?`,
        )
        .bind(now, now, teacher.id)
        .run();

      // In-app notification
      try {
        await db
          .prepare(
            `INSERT INTO Notification (id, userId, type, title, message, link, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            genId(),
            teacher.id,
            'verification_files_requested',
            '📁 Bienvenue ! Envoyez 5 fichiers de vérification',
            `Bonjour ${teacher.firstName || ''}, votre profil est complet ! Pour finaliser la vérification de votre compte enseignant et obtenir le badge "Vérifié", merci d'envoyer 5 fichiers Word ou PDF d'exemple avec votre nom et prénom.`,
            '/enseignant/verification',
            now,
          )
          .run();
      } catch {}

      // Email
      if (teacher.email) {
        try {
          await sendTeacherFileRequestEmail({
            to: teacher.email,
            firstName: teacher.firstName || '',
            lastName: teacher.lastName || '',
            email: teacher.email,
            note: 'Votre profil est complet. Pour finaliser la vérification, merci d\'envoyer 5 fichiers avec votre nom et prénom.',
          });
        } catch (e) {
          console.error('[verification page] email error:', e);
        }
      }

      // Refetch to get updated status
      const updated: any = await db
        .prepare(
          `SELECT status, verificationFilesRequestedAt, verificationFilesReceivedAt,
                  verificationFilesNote, isVerifiedTeacher
           FROM User WHERE id = ?`,
        )
        .bind(teacher.id)
        .first();
      if (updated) {
        teacher.status = updated.status;
        teacher.verificationFilesRequestedAt = updated.verificationFilesRequestedAt;
        teacher.verificationFilesReceivedAt = updated.verificationFilesReceivedAt;
        teacher.verificationFilesNote = updated.verificationFilesNote;
        teacher.isVerifiedTeacher = updated.isVerifiedTeacher;
      }
    }
  }

  const filesResult: any = await db
    .prepare(
      `SELECT id, fileName, originalFormat, fileSize, fileUrl, type, description, year,
              uploadedAt, reviewedByAdmin, reviewNote
       FROM TeacherVerificationFile WHERE teacherId = ?
       ORDER BY uploadedAt DESC`,
    )
    .bind(user.id)
    .all();

  const files = (filesResult?.results || []).map((f: any) => ({
    id: f.id,
    fileName: f.fileName,
    originalFormat: f.originalFormat || 'unknown',
    fileUrl: f.fileUrl,
    fileSize: f.fileSize,
    type: f.type,
    description: f.description,
    year: f.year,
    uploadedAt: f.uploadedAt ? new Date(f.uploadedAt).toISOString() : new Date().toISOString(),
    reviewedByAdmin: !!f.reviewedByAdmin,
  }));

  const status = teacher.status as string;
  const requestedAtISO = teacher.verificationFilesRequestedAt
    ? new Date(Number(teacher.verificationFilesRequestedAt)).toISOString()
    : null;
  const receivedAtISO = teacher.verificationFilesReceivedAt
    ? new Date(Number(teacher.verificationFilesReceivedAt)).toISOString()
    : null;
  const remaining = Math.max(0, 5 - files.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
            <Shield className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold mb-1">Vérification de votre compte</h1>
            <p className="text-violet-100 text-sm">
              Pour devenir un Enseignant Vérifié, envoyez 5 fichiers Word ou PDF d'exemple de votre travail.
            </p>
          </div>
        </div>
      </div>

      {/* Status banners */}
      {status === 'PENDING_FILE_VERIFICATION' && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Clock className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-amber-900 mb-1">En attente de vos 5 fichiers</h3>
              <p className="text-sm text-amber-800 mb-2">
                Pour finaliser la vérification, merci d'envoyer 5 fichiers Word (.docx) ou PDF
                contenant des exemples de votre travail (cours, séries, devoirs).
                Chaque fichier doit inclure votre nom et prénom.
              </p>
              {requestedAtISO && (
                <p className="text-xs text-amber-700">
                  📅 Demande envoyée le {new Date(requestedAtISO).toLocaleDateString('fr-FR')} · Vous avez 7 jours.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {status === 'PENDING_REVIEW' && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Clock className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-blue-900 mb-1">Fichiers reçus — en cours d'examen</h3>
              <p className="text-sm text-blue-800">
                Notre équipe examine vos fichiers. Vous recevrez un email dès la décision.
                {receivedAtISO && (
                  <> Reçus le {new Date(receivedAtISO).toLocaleDateString('fr-FR')}.</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {status === 'ACTIVE' && !teacher.isVerifiedTeacher && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-emerald-900 mb-1">Compte approuvé !</h3>
              <p className="text-sm text-emerald-800">
                Votre compte est actif. Le badge "Vérifié" apparaîtra dès que vos fichiers seront validés.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Uploader */}
      <VerificationFilesUploader
        initialFiles={files}
        initialRemaining={remaining}
        initialRequestedAt={requestedAtISO}
        initialReceivedAt={receivedAtISO}
        initialStatus={status}
        note={teacher.verificationFilesNote}
      />

      {/* What we verify */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <h3 className="font-bold text-slate-900 mb-3">📋 Ce que nous vérifions</h3>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Que les fichiers sont bien des productions pédagogiques de votre cru</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Que votre nom et prénom apparaissent sur chaque document</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Que le contenu est cohérent avec une activité d'enseignement</span>
          </li>
        </ul>
        <p className="text-xs text-slate-500 mt-3">
          🔒 Vos fichiers sont confidentiels et utilisés uniquement pour la vérification.
        </p>
      </div>
    </div>
  );
}

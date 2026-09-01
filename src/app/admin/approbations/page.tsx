// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { CheckCircle } from 'lucide-react';
import ApprobationsClient from '@/components/admin/ApprobationsClient';

export const dynamic = 'force-dynamic';

function formatDateLabel(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return `${Math.max(0, diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString('fr-FR');
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export default async function AdminApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  const db = await getD1();
  const now = new Date();

  // Pending teachers (any non-ACTIVE status for TEACHER role)
  const teachersR = await db.prepare(`
    SELECT 
      u.id, u.email, u.firstName, u.lastName, u.schoolName, u.governorate,
      u.diploma, u.teachingSubjects, u.teachingLevels,
      u.createdAt, u.status, u.emailVerifiedAt, u.approvedAt, u.isVerifiedTeacher,
      (SELECT COUNT(*) FROM TeacherFile WHERE teacherId = u.id) AS uploadedFiles,
      (SELECT COUNT(*) FROM TeacherVerificationFile WHERE userId = u.id) AS verificationFiles,
      (SELECT MIN(createdAt) FROM TeacherVerificationFile WHERE userId = u.id) AS firstVerificationAt
    FROM User u
    WHERE u.role = 'TEACHER' AND u.status IN ('PENDING_APPROVAL', 'PENDING_FILE_VERIFICATION', 'PENDING_OTP')
    ORDER BY u.createdAt DESC
    LIMIT 50
  `).all().catch(() => ({ results: [] }));

  // Pending resources
  const resourcesR = await db.prepare(`
    SELECT 
      r.id, r.title, r.status, r.createdAt, r.type, r.classId, r.subjectId,
      r.fileKey, r.fileUrl,
      s.nameFr AS subjectNameFr,
      c.nameFr AS classNameFr,
      t.firstName AS teacherFirstName, t.lastName AS teacherLastName, t.email AS teacherEmail, t.schoolName AS teacherSchoolName
    FROM Resource r
    LEFT JOIN Subject s ON r.subjectId = s.id
    LEFT JOIN "Class" c ON r.classId = c.id
    LEFT JOIN User t ON r.teacherId = t.id
    WHERE r.status = 'PENDING_APPROVAL'
    ORDER BY r.createdAt DESC
    LIMIT 50
  `).all().catch(() => ({ results: [] }));

  // Convert to the format the client component expects
  const ms = (v: any) => (v == null || v === 0 ? null : new Date(Number(v)).toISOString());
  const pendingTeachers = (teachersR?.results || []).map((t: any) => ({
    id: t.id,
    email: t.email,
    firstName: t.firstName,
    lastName: t.lastName,
    schoolName: t.schoolName,
    governorate: t.governorate,
    diploma: t.diploma,
    teachingSubjects: t.teachingSubjects,
    teachingLevels: t.teachingLevels,
    status: t.status,
    isVerifiedTeacher: !!t.isVerifiedTeacher,
    createdAt: ms(t.createdAt),
    emailVerifiedAt: ms(t.emailVerifiedAt),
    verificationFilesRequestedAt: ms(t.firstVerificationAt),
    verificationFilesCount: t.verificationFiles || 0,
    verificationFilesReceivedAt: null,
    invitationStatus: null,
    invitationSentAt: null,
    lastInvitationId: null,
    _count: { uploadedFiles: t.uploadedFiles || 0, library: 0, verificationFiles: t.verificationFiles || 0 },
  }));

  const pendingResources = (resourcesR?.results || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    type: r.type,
    createdAt: ms(r.createdAt),
    fileKey: r.fileKey,
    fileUrl: r.fileUrl,
    
    subject: { nameFr: r.subjectNameFr },
    class: { nameFr: r.classNameFr },
    teacher: {
      firstName: r.teacherFirstName,
      lastName: r.teacherLastName,
      email: r.teacherEmail,
      schoolName: r.teacherSchoolName,
    },
  }));

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-6 flex items-center gap-2">
        <CheckCircle className="w-7 h-7 text-emerald-500" />
        Approbations en attente
      </h1>

      {pendingTeachers.length === 0 && pendingResources.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-12 text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-3 text-emerald-500" />
          <p className="font-bold text-emerald-800 text-2xl mb-2">Tout est à jour ! 🎉</p>
          <p className="text-emerald-700">Aucune demande en attente d'approbation.</p>
        </div>
      ) : (
        <ApprobationsClient
          initialTeachers={pendingTeachers.map((t) => ({
            ...t,
            createdAtLabel: formatDateLabel(t.createdAt, now) ?? '',
            verificationFilesRequestedAtLabel: formatDateLabel(t.verificationFilesRequestedAt, now),
          }))}
          initialResources={pendingResources.map((r) => ({
            ...r,
            createdAtLabel: formatDateLabel(r.createdAt, now) ?? '',
          }))}
        />
      )}
    </div>
  );
}

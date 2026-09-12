// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { d1All } from '@/lib/db-d1';
import VerificationsClient from './VerificationsClient';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Vérifications enseignants',
  robots: { index: false, follow: false },
};

export default async function VerificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'ADMIN') redirect('/');

  // Fetch all teachers who have verification files OR are in pending verification statuses
  const teachersR = await d1All(
    `SELECT
       u.id, u.email, u.firstName, u.lastName, u.schoolName, u.governorate, u.diploma,
       u.status, u.isVerifiedTeacher, u.verifiedAt,
       u.verificationFilesRequestedAt, u.verificationFilesReceivedAt, u.verificationFilesNote,
       u.createdAt
     FROM User u
     WHERE u.role = 'TEACHER' 
       AND (u.isDismissed IS NULL OR u.isDismissed = 0)
       AND (
         u.status IN ('PENDING_FILE_VERIFICATION', 'PENDING_REVIEW', 'ACTIVE')
         OR EXISTS (SELECT 1 FROM TeacherVerificationFile tvf WHERE tvf.userId = u.id)
       )
     ORDER BY
       CASE u.status
         WHEN 'PENDING_REVIEW' THEN 0
         WHEN 'PENDING_FILE_VERIFICATION' THEN 1
         WHEN 'ACTIVE' THEN 2
         ELSE 3
       END,
       u.verificationFilesReceivedAt DESC NULLS LAST,
       u.createdAt DESC
     LIMIT 100`
  );

  // Fetch all files for these teachers in one query
  const teachers = teachersR || [];
  const teacherIds = teachers.map((t: any) => t.id);

  let filesByTeacher: Record<string, any[]> = {};
  if (teacherIds.length > 0) {
    // Build IN clause manually (D1 doesn't support arrays in prepared statements)
    const placeholders = teacherIds.map(() => '?').join(',');
    const filesR = await d1All(
      `SELECT id, userId, fileName, originalFormat, fileUrl, mimeType, fileSize,
              type, description, year, reviewedByAdmin, reviewNote,
              reviewedAt, uploadedAt, createdAt
       FROM TeacherVerificationFile
       WHERE userId IN (${placeholders})
       ORDER BY uploadedAt DESC`,
      ...teacherIds
    );
    const files = filesR || [];
    for (const f of files) {
      if (!filesByTeacher[f.userId]) filesByTeacher[f.userId] = [];
      filesByTeacher[f.userId].push(f);
    }
  }

  // Hydrate teachers with files + computed fields
  const enriched = teachers.map((t: any) => {
    const tFiles = filesByTeacher[t.id] || [];
    const reviewed = tFiles.filter((f: any) => f.reviewedByAdmin).length;
    return {
      id: t.id,
      email: t.email,
      firstName: t.firstName,
      lastName: t.lastName,
      schoolName: t.schoolName,
      governorate: t.governorate,
      diploma: t.diploma,
      status: t.status,
      isVerifiedTeacher: !!t.isVerifiedTeacher,
      verifiedAt: t.verifiedAt ? Number(t.verifiedAt) : null,
      verificationFilesRequestedAt: t.verificationFilesRequestedAt ? Number(t.verificationFilesRequestedAt) : null,
      verificationFilesReceivedAt: t.verificationFilesReceivedAt ? Number(t.verificationFilesReceivedAt) : null,
      verificationFilesNote: t.verificationFilesNote,
      files: tFiles.map((f: any) => ({
        id: f.id,
        fileName: f.fileName,
        originalFormat: f.originalFormat,
        fileUrl: f.fileUrl,
        mimeType: f.mimeType,
        fileSize: f.fileSize,
        type: f.type,
        description: f.description,
        year: f.year,
        reviewedByAdmin: !!f.reviewedByAdmin,
        reviewNote: f.reviewNote,
        reviewedAt: f.reviewedAt ? Number(f.reviewedAt) : null,
        uploadedAt: f.uploadedAt ? Number(f.uploadedAt) : null,
        createdAt: f.createdAt ? Number(f.createdAt) : null,
      })),
      reviewedCount: reviewed,
    };
  });

  return <VerificationsClient initialTeachers={enriched} />;
}

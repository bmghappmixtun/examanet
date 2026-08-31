// @ts-nocheck
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import TeacherLibraryClient from '@/components/teacher/TeacherLibraryClient';
import { d1All, d1First } from '@/lib/db-d1';

export const dynamic = 'force-dynamic';

/**
 * Extract a timestamp from a file key like
 * "teacher-library/{teacherId}/1786589609365-filename.pdf".
 * Returns ISO string or undefined.
 */
function extractTimestampFromKey(key: string): string | undefined {
  if (!key) return undefined;
  const m = /\/(\d{13,})-/.exec(key);
  if (m) {
    const ts = Number(m[1]);
    if (ts > 1_000_000_000_000) return new Date(ts).toISOString();
  }
  return undefined;
}

export default async function TeacherLibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion');
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    redirect('/');
  }

  // SSR pre-fetch: classes + subjects + files + canUpload
  const [classesR, subjectsR, filesR, statusR] = await Promise.all([
    d1All('SELECT id, nameFr, nameAr, slug FROM "Class" ORDER BY "order" ASC'),
    d1All('SELECT id, nameFr, nameAr, slug, color, icon FROM Subject ORDER BY nameFr ASC'),
    d1All(
      `SELECT id, teacherId, resourceId, fileName, fileKey, fileUrl, r2Key, r2PdfKey,
              fileSize, mimeType, isActive, createdAt, updatedAt
       FROM TeacherFile
       WHERE teacherId = ? AND isActive = 1
       ORDER BY createdAt DESC
       LIMIT 200`,
      user.id,
    ),
    d1First('SELECT status FROM User WHERE id = ?', user.id),
  ]);

  const canUpload = statusR?.status === 'ACTIVE';

  // Normalize files for client (extract format from filename, fix isActive boolean)
  const normalizedFiles = (filesR || []).map((f: any) => {
    let fmt = '';
    if (f.fileName) {
      const m = /\.([a-z0-9]+)$/i.exec(f.fileName);
      if (m) fmt = m[1].toLowerCase();
    }
    if (!fmt && f.mimeType) {
      const mt = String(f.mimeType).toLowerCase();
      if (mt.includes('pdf')) fmt = 'pdf';
      else if (mt.includes('word') || mt.includes('document')) fmt = 'docx';
      else if (mt.includes('opendocument')) fmt = 'odt';
    }
    return {
      ...f,
      isActive: Boolean(f.isActive),
      originalFormat: fmt || 'other',
      // createdAt is a number (ms) from D1, convert to ISO string for client.
      // If createdAt is 0 / null / undefined (legacy Vercel Blob records that
      // were imported without timestamps), use fileKey timestamp as fallback
      // or fall back to the current date so we don't show "01 janv. 1970".
      createdAt:
        typeof f.createdAt === 'number' && f.createdAt > 0
          ? new Date(f.createdAt).toISOString()
          : typeof f.fileKey === 'string'
            ? extractTimestampFromKey(f.fileKey)
            : f.createdAt,
    };
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          📚 Ma bibliothèque
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Tous vos fichiers originaux (Word, PDF) sont sauvegardés ici. Vous pouvez les télécharger
          à tout moment et les réutiliser pour publier de nouvelles ressources.
        </p>
      </div>
      <TeacherLibraryClient
        classes={classesR || []}
        subjects={subjectsR || []}
        initialFiles={normalizedFiles}
        initialCanUpload={canUpload}
      />
    </div>
  );
}

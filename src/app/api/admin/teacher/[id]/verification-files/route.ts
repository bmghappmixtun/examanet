// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1All, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

/**
 * GET /api/admin/teacher/[id]/verification-files
 * Returns the verification files uploaded by a specific teacher.
 * Used by the admin UI to review them.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id } = await params;

  // 2026-09-11: Switched from d1-admin (db.user.findUnique) to raw SQL (d1First/d1All).
  // Bug: db.user.findUnique was returning null even though the teacher existed in D1.
  // Likely cause: the proxy model-name translation or select-handling had a subtle
  // issue that swallowed the result. Raw SQL is more reliable + matches the pattern
  // used by the sibling /api/admin/teacher/[id]/approve-verification route.

  const teacher = await d1First(
    `SELECT id, firstName, lastName, email, schoolName, governorate, diploma, status,
            verificationFilesRequestedAt,
            verificationFilesReceivedAt, verificationFilesNote
     FROM User WHERE id = ?`,
    id,
  );

  console.log('[GET verification-files] teacher for id', id, ':', teacher ? `FOUND ${teacher.email}` : 'NULL');

const filesResult = await d1All(
    `SELECT id, fileName, originalFormat, fileKey, fileUrl, mimeType, fileSize, type,
            description, year, teacherId, userId, reviewedByAdmin, reviewNote,
            reviewedAt, rejectionReason, createdAt, uploadedAt
     FROM TeacherVerificationFile WHERE userId = ?
     ORDER BY uploadedAt DESC`,
    id,
  );

  console.log('[GET verification-files] files count:', (filesResult || []).length);

  if (!teacher) {
    return NextResponse.json({ error: 'Enseignant non trouvé' }, { status: 404 });
  }

  return NextResponse.json({
    teacher,
    files: (filesResult || []).map((f: any) => ({
      id: f.id,
      fileName: f.fileName,
      fileSize: f.fileSize,
      fileUrl: f.fileUrl,
      originalFormat: f.originalFormat,
      type: f.type,
      description: f.description,
      year: f.year,
      uploadedAt: f.uploadedAt ? new Date(Number(f.uploadedAt)).toISOString() : new Date().toISOString(),
      reviewedByAdmin: !!f.reviewedByAdmin,
      reviewedAt: f.reviewedAt ? new Date(Number(f.reviewedAt)).toISOString() : null,
      reviewNote: f.reviewNote,
    })),
  });
}

/**
 * PATCH /api/admin/teacher/[id]/verification-files
 * Mark a file as reviewed (or unmark).
 * Body: { fileId: string, reviewed: boolean, note?: string }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
    if (!isValidOrigin(req)) {
      return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { fileId, reviewed, note } = body as { fileId?: string; reviewed?: boolean; note?: string };

    if (!fileId) {
      return NextResponse.json({ error: 'fileId requis' }, { status: 400 });
    }

    // 2026-09-11: Switched to raw SQL (same reason as the GET handler above).
    const file: any = await d1First(
      'SELECT id, userId, teacherId FROM TeacherVerificationFile WHERE id = ?',
      fileId,
    );

    if (!file || (file.userId !== id && file.teacherId !== id)) {
      return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 });
    }

    const result = await d1Run(
      `UPDATE TeacherVerificationFile
       SET reviewedByAdmin = ?, reviewedAt = ?, reviewNote = ?
       WHERE id = ?`,
      reviewed ? 1 : 0,
      reviewed ? Date.now() : null,
      note || null,
      fileId,
    );

    if (!result.success) {
      console.error('[PATCH verification-files] d1Run failed:', result.error);
      return NextResponse.json({ error: result.error || 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[PATCH verification-files] OUTER exception:', e.message, e.stack);
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}

// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

  const [teacher, files] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        schoolName: true,
        governorate: true,
        diploma: true,
        status: true,
        verificationFilesRequestedAt: true,
        verificationFilesCount: true,
        verificationFilesReceivedAt: true,
        verificationFilesNote: true,
      },
    }),
    prisma.teacherVerificationFile.findMany({
      where: { teacherId: id },
      orderBy: { uploadedAt: 'desc' },
    }),
  ]);

  if (!teacher) {
    return NextResponse.json({ error: 'Enseignant non trouvé' }, { status: 404 });
  }

  return NextResponse.json({
    teacher,
    files: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      fileSize: f.fileSize,
      fileUrl: f.fileUrl,
      originalFormat: f.originalFormat,
      type: f.type,
      description: f.description,
      year: f.year,
      uploadedAt: f.uploadedAt.toISOString(),
      reviewedByAdmin: f.reviewedByAdmin,
      reviewedAt: f.reviewedAt?.toISOString() || null,
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
  const admin = await getCurrentUser();
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { id: teacherId } = await params;
  const body = await req.json().catch(() => ({}));
  const { fileId, reviewed, note } = body;

  if (!fileId) {
    return NextResponse.json({ error: 'fileId requis' }, { status: 400 });
  }

  const file = await prisma.teacherVerificationFile.findUnique({ where: { id: fileId } });
  if (!file || file.teacherId !== teacherId) {
    return NextResponse.json({ error: 'Fichier non trouvé' }, { status: 404 });
  }

  await prisma.teacherVerificationFile.update({
    where: { id: fileId },
    data: {
      reviewedByAdmin: !!reviewed,
      reviewedAt: reviewed ? new Date() : null,
      reviewNote: note || null,
    },
  });

  return NextResponse.json({ success: true });
}

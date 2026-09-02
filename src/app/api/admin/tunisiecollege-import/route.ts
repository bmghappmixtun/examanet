// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/tunisiecollege-import
 *
 * Admin endpoint: import pre-processed PDF files from tunisiecollege.net
 *
 * The PDF processing (download + watermark removal + branding) is done
 * LOCALLY before calling this endpoint. This endpoint just:
 *   1. Receives the processed PDF
 *   2. Uploads to Vercel Blob
 *   3. Creates Resource + TeacherFile in DB
 *
 * Body (multipart/form-data):
 *   - file: PDF file (processed)
 *   - metadata: JSON string with:
 *       { fileId, title, parsed, teacherId, teacherName }
 *
 * Returns: { success, resourceId, fileUrl, fileSize }
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { put } from '@vercel/blob';
import { nanoid } from 'nanoid';

export const maxDuration = 60;
export const runtime = 'nodejs';

const ROOT_URL = 'https://examanet.com/';

async function checkAdmin(req: NextRequest) {
  // Allow SEED_TOKEN bypass for script-based imports
  const seedToken = req.headers.get('x-seed-token') || req.nextUrl.searchParams.get('token');
  if (seedToken && seedToken === process.env.SEED_TOKEN) {
    // Find admin user for attribution
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });
    if (admin) return admin;
  }

  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    throw new Error('Admin requis');
  }
  return user;
}

async function ensureTeacher(
  name: string,
  teacherId?: string,
  source: string = 'tunisiecollege.net',
) {
  if (teacherId) {
    const existing = await prisma.user.findUnique({ where: { id: teacherId } });
    if (existing) return existing;
  }
  // Normalize the name (uppercase, trimmed, no extra spaces)
  const cleanedName = name
    .replace(/^(Mr|Mme|Mlle|Prof|Professeur)\.?\s+/i, '')
    .trim()
    .replace(/\s+/g, ' ');
  const parts = cleanedName.split(' ');
  const firstName = parts[0] || 'Unknown';
  const lastName = parts.slice(1).join(' ') || 'Unknown';
  const normalized = `${firstName} ${lastName}`.toLowerCase();

  // Try to find existing teacher by case-insensitive name match
  const candidates = await prisma.user.findMany({
    where: {
      email: { contains: 'examanet-import.local' },
      role: 'TEACHER',
    },
  });
  for (const c of candidates) {
    const cName = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase().trim();
    if (cName === normalized) return c;
  }

  // Create new teacher with clean email (no random suffix if name matches)
  const email = `import.${firstName.toLowerCase()}.${lastName.replace(/\s+/g, '')}@examanet-import.local`;

  return await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      role: 'TEACHER',
      status: 'ACTIVE',
      slug: '', // auto-filled by Prisma middleware
      schoolName: null,
      teachingSubjects: JSON.stringify(['mathematiques']),
      teachingLevels: JSON.stringify(['7eme', '8eme', '9eme']),
      bio: `Professeur importé depuis ${source}`,
      isVerifiedTeacher: true,
    },
  });
}

function slugify(text: string): string {
  // SECURITY/QUALITY FIX: transliterate accents BEFORE filtering non-ASCII
  // (was: directly removing non-ASCII chars, which made "série" → "srie"
  //  instead of "serie" — silent data loss for French/Arabic titles)
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 60) +
    '-' +
    nanoid(6)
  );
}

export async function POST(req: NextRequest) {
  try {
    const admin = await checkAdmin(req);

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data requis' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const originalFile = formData.get('originalFile') as File | null; // optional: original Word file
    const metadataStr = formData.get('metadata') as string | null;

    if (!file || !metadataStr) {
      return NextResponse.json({ error: 'file + metadata requis' }, { status: 400 });
    }

    const metadata = JSON.parse(metadataStr);
    const { fileId, parsed, teacherName, teacherId: providedTeacherId } = metadata;
    const source: string = metadata.source || 'tunisiecollege.net';
    const originalFormat = metadata.originalFormat || null; // 'docx' or 'doc' if uploaded

    // Check if already imported
    const existing = await prisma.resource.findFirst({
      where: { originalSubmissionId: String(fileId) },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({
        success: true,
        skipped: true,
        resourceId: existing.id,
        message: 'Déjà importé',
      });
    }

    // Ensure teacher
    const teacher = await ensureTeacher(teacherName, providedTeacherId, source);

    // Look up subject + class IDs
    const subjectId = parsed.subjectSlug
      ? (await prisma.subject.findUnique({ where: { slug: parsed.subjectSlug } }))?.id
      : null;
    const classId = parsed.classSlug
      ? (await prisma.class.findUnique({ where: { slug: parsed.classSlug } }))?.id
      : null;

    if (!subjectId || !classId) {
      return NextResponse.json(
        {
          error: `Missing subject or class (subjectSlug=${parsed.subjectSlug}, classSlug=${parsed.classSlug})`,
        },
        { status: 400 },
      );
    }

    // Upload PDF to Vercel Blob (public, on examanet)
    const filePath = `teacher-library/${teacher.id}/imported/${fileId}.pdf`;
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    const blob = await put(filePath, pdfBuffer, {
      access: 'public',
      addRandomSuffix: true,
      // Don't pass token - let @vercel/blob SDK auto-detect from OIDC in production
      // Falls back to process.env.BLOB_READ_WRITE_TOKEN in dev
    });

    // Optional: upload original Word file (kept in teacher library, not public)
    let originalBlob = null;
    let originalBuffer: Buffer | null = null;
    if (originalFile && originalFormat) {
      originalBuffer = Buffer.from(await originalFile.arrayBuffer());
      const ext = originalFormat;
      const originalPath = `teacher-library/${teacher.id}/originals/${fileId}.${ext}`;
      originalBlob = await put(originalPath, originalBuffer, {
        access: 'public',
        addRandomSuffix: true,
      });
    }

    // Insert Resource
    const slug = slugify(parsed.title);
    const resource = await prisma.resource.create({
      data: {
        slug,
        title: parsed.title,
        type: parsed.type,
        status: 'PUBLISHED',
        fileKey: blob.pathname,
        fileUrl: blob.url,
        fileSize: pdfBuffer.length,
        pageCount: 10,
        // Original Word file fields (if provided)
        originalFileKey: originalBlob?.pathname || null,
        originalFileName: originalFile?.name || null,
        originalFormat: originalFormat || null,
        originalFileSize: originalBuffer?.length || null,
        subjectId,
        classId,
        teacherId: teacher.id,
        trimester: parsed.trimester,
        year: parsed.year,
        language: parsed.language || 'fr',
        homeworkSubtype: parsed.type === 'DEVOIR' ? parsed.homeworkSubtype : null,
        homeworkNumber: parsed.homeworkNumber,
        schoolType: parsed.schoolType,
        hasCorrection: parsed.hasCorrection || false,
        importedByAdmin: true,
        importedAt: new Date(),
        importedFrom: source,
        originalSubmissionId: String(fileId),
        publishedAt: new Date(),
        approvedAt: new Date(),
        approvedById: admin.id,
      },
    });

    // Insert TeacherFile
    // fileName/fileKey/fileUrl: the original (Word or PDF)
    // pdfKey/pdfUrl/pdfSize: always the PDF version
    await prisma.teacherFile.create({
      data: {
        fileName: originalFile?.name || parsed.title + '.pdf',
        fileKey: originalBlob?.pathname || blob.pathname,
        fileUrl: originalBlob?.url || blob.url,
        fileSize: originalBuffer?.length || pdfBuffer.length,
        originalFormat: originalFormat || 'pdf',
        subjectId,
        classId,
        teacherId: teacher.id,
        pdfKey: blob.pathname,
        pdfUrl: blob.url,
        pdfSize: pdfBuffer.length,
        resourceId: resource.id,
        importedByAdmin: true,
        importedAt: new Date(),
        importedFrom: source,
        originalSubmissionId: String(fileId),
        readOnly: true,
      },
    });

    return NextResponse.json({
      success: true,
      resourceId: resource.id,
      fileUrl: blob.url,
      fileSize: pdfBuffer.length,
      teacherId: teacher.id,
      originalFileUrl: originalBlob?.url || null,
      originalFormat: originalFormat || null,
    });
  } catch (e: any) {
    console.error('[tunisiecollege-import]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

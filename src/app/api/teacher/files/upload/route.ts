// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/files/upload
 *
 * Accepts a single file upload (.pdf, .docx, .doc, .odt) from a teacher.
 * Saves to R2 (CF Workers) and creates a TeacherFile record in D1.
 *
 * D1 TeacherFile columns: id, teacherId, resourceId, fileName, fileKey, fileUrl,
 *   r2Key, r2PdfKey, fileSize, mimeType, isActive, createdAt, updatedAt
 * (No originalFormat, no pdfKey/pdfUrl/pdfSize, no conversionStatus,
 *  no classId/sectionId/subjectId, no type/trimester/year/notes/tags.)
 *
 * D1 schema differences vs Prisma are handled by writing only the columns that
 * exist. Metadata (class/subject/type) is ignored here — these are set when
 * the resource is published, not when the file is uploaded to the library.
 *
 * Docx→PDF conversion is NOT done (puppeteer can't run on CF Workers).
 * We mark the conversion as 'SKIPPED' in the response payload, but D1 has no
 * column for it so the warning is the only signal to the client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { getCurrentUser } from '@/lib/auth';
import { d1Run, genId } from '@/lib/db-d1';

export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

async function getContext() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  return await getCloudflareContext({ async: true });
}

function detectFormat(fileName: string, mimeType: string | null): {
  format: 'pdf' | 'docx' | 'doc' | 'odt' | 'unknown';
  isPdf: boolean;
  isConvertible: boolean;
} {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') {
    return { format: 'pdf', isPdf: true, isConvertible: false };
  }
  if (lower.endsWith('.docx')) {
    return { format: 'docx', isPdf: false, isConvertible: true };
  }
  if (lower.endsWith('.doc')) {
    return { format: 'doc', isPdf: false, isConvertible: true };
  }
  if (lower.endsWith('.odt')) {
    return { format: 'odt', isPdf: false, isConvertible: true };
  }
  return { format: 'unknown', isPdf: false, isConvertible: false };
}

export async function POST(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Seuls les enseignants peuvent uploader des fichiers' },
        { status: 403 },
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` },
        { status: 400 },
      );
    }

    const format = detectFormat(file.name, file.type);
    if (format.format === 'unknown') {
      return NextResponse.json(
        { error: `Format non supporté: ${file.name}. Formats acceptés: .pdf, .docx, .doc, .odt` },
        { status: 400 },
      );
    }

    // Magic number check
    const bytes = new Uint8Array(await file.arrayBuffer());
    const firstBytes = bytes.slice(0, 8);
    let magicOk = true;
    if (format.isPdf) {
      magicOk = firstBytes[0] === 0x25 && firstBytes[1] === 0x50 && firstBytes[2] === 0x44 && firstBytes[3] === 0x46; // %PDF
    } else if (format.format === 'docx' || format.format === 'doc' || format.format === 'odt') {
      const isPK = firstBytes[0] === 0x50 && firstBytes[1] === 0x4b; // ZIP
      const isOLE = firstBytes[0] === 0xd0 && firstBytes[1] === 0xcf && firstBytes[2] === 0x11 && firstBytes[3] === 0xe0; // OLE
      magicOk = isPK || isOLE;
    }
    if (!magicOk) {
      return NextResponse.json(
        { error: "Type de fichier invalide. Le contenu ne correspond pas à l'extension." },
        { status: 400 },
      );
    }

    const teacherId = user.id;
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    // 1. Upload original to R2
    const ctx = await getContext();
    const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;
    if (!bucket) {
      return NextResponse.json(
        { error: 'Stockage R2 non configuré' },
        { status: 500 },
      );
    }

    const originalKey = `teacher-library/${teacherId}/${timestamp}-${safeName}`;
    const arrayBuffer = await file.arrayBuffer();
    await bucket.put(originalKey, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });

    // Build a public URL — for now use a placeholder (real CDN URL would be set in a custom domain binding)
    const fileUrl = `https://r2.examanet.com/${originalKey}`;

    // 2. PDF conversion: not available on CF Workers. We mark SKIPPED in the
    //    response and warn the client. For docx/doc/odt uploads, the user
    //    must re-upload as PDF before publishing.
    let conversionStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
    const warnings: string[] = [];
    if (format.isConvertible) {
      conversionStatus = 'SKIPPED';
      warnings.push(
        "Conversion automatique non disponible sur Workers. Pour publier en PDF, ré-uploadez un PDF ou utilisez l'aperçu généré côté client.",
      );
    }

    // 3. Save TeacherFile record to D1
    const fileId = genId();
    const now = Date.now();

    await d1Run(
      `INSERT INTO TeacherFile (id, teacherId, resourceId, fileName, fileKey, fileUrl,
                                r2Key, r2PdfKey, fileSize, mimeType, isActive, createdAt, updatedAt)
       VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, 1, ?, ?)`,
      fileId,
      teacherId,
      file.name,
      originalKey,
      fileUrl,
      originalKey,
      file.size,
      file.type || null,
      now,
      now,
    );

    return NextResponse.json({
      success: true,
      libraryFileId: fileId,
      fileKey: originalKey,
      fileUrl,
      pdfKey: format.isPdf ? originalKey : null,
      pdfUrl: format.isPdf ? fileUrl : null,
      originalFormat: format.format,
      conversionStatus,
      warnings: warnings.length > 0 ? warnings : undefined,
      file: {
        id: fileId,
        fileName: file.name,
        fileSize: file.size,
        originalFormat: format.format,
        createdAt: now,
      },
    });
  } catch (err: any) {
    console.error('[teacher/files/upload]', err);
    return NextResponse.json(
      { error: err?.message || 'Erreur serveur' },
      { status: 500 },
    );
  }
}

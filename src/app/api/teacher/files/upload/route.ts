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
    const fileUrl = `/api/files/${originalKey}`;

    // 2. PDF conversion via iLovePDF (Office → PDF) if the file is convertible.
    //    2026-09-06: wired up the @ilovepdf/ilovepdf-nodejs SDK which was
    //    already installed but unused. The conversion runs server-side
    //    (iLovePDF's external service), so no Puppeteer/Chromium needed on
    //    CF Workers. If env vars are missing, we gracefully fall back to
    //    SKIPPED + a warning (the original behavior).
    let conversionStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
    let r2PdfKey: string | null = null;
    let pdfUrl: string | null = null;
    const warnings: string[] = [];

    if (format.isConvertible) {
      const iLovePublicKey = process.env.I_LOVE_API_PUBLIC_KEY;
      const iLoveSecretKey = process.env.I_LOVE_API_SECRET_KEY;
      if (!iLovePublicKey || !iLoveSecretKey) {
        conversionStatus = 'SKIPPED';
        warnings.push(
          "Conversion Office→PDF non configurée (clés API iLovePDF manquantes). Pour publier en PDF, ré-uploadez un PDF.",
        );
        console.warn('[upload] I_LOVE_API_PUBLIC_KEY / I_LOVE_API_SECRET_KEY not set — skipping conversion');
      } else {
        try {
          const { convertOfficeToPdfViaIloveapi } = await import('@/lib/iloveapi');
          console.log(
            `[upload] Converting ${file.name} (${format.format}) to PDF via iLoveAPI…`,
          );
          const result = await convertOfficeToPdfViaIloveapi(
            Buffer.from(arrayBuffer),
            file.name,
            iLovePublicKey,
            iLoveSecretKey,
          );
          // Upload the PDF to R2 next to the original
          const pdfSafeName = safeName.replace(/\.[a-z0-9]+$/i, '') + '.pdf';
          const pdfKey = `teacher-library/${teacherId}/${timestamp}-${pdfSafeName}`;
          await bucket.put(pdfKey, result.pdfBuffer, {
            httpMetadata: { contentType: 'application/pdf' },
          });
          r2PdfKey = pdfKey;
          pdfUrl = `/api/files/${pdfKey}`;
          conversionStatus = 'SUCCESS';
          console.log(
            `[upload] Conversion OK: ${file.size} → ${result.pdfSize} bytes`,
          );
        } catch (e: any) {
          conversionStatus = 'FAILED';
          warnings.push(
            `Échec de la conversion Office→PDF: ${e?.message || 'erreur inconnue'}. L'original a été uploadé mais sans PDF.`,
          );
          console.error('[upload] iLoveAPI conversion failed:', e?.message || e);
        }
      }
    }

    // 3. Save TeacherFile record to D1
    const fileId = genId();
    const now = Date.now();

    await d1Run(
      `INSERT INTO TeacherFile (id, teacherId, resourceId, fileName, fileKey, fileUrl,
                                r2Key, r2PdfKey, fileSize, mimeType, isActive, createdAt, updatedAt)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      fileId,
      teacherId,
      file.name,
      originalKey,
      fileUrl,
      originalKey,
      r2PdfKey, // null if no conversion, set if iLovePDF succeeded
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
      pdfKey: format.isPdf ? originalKey : r2PdfKey,
      pdfUrl: format.isPdf ? fileUrl : pdfUrl,
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

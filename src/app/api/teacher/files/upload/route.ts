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
import { checkTeacherCanPublish } from '@/lib/teacher-eligibility';

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
    // 2026-09-15 BUG FIX: also block teachers in non-publishing statuses
    // (PENDING_APPROVAL, PENDING_FILE_VERIFICATION, PENDING_REVIEW)
    const eligibility = checkTeacherCanPublish(user);
    if (!eligibility.ok) {
      return NextResponse.json(
        { error: eligibility.error, code: eligibility.code },
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
    //    2026-09-06: HARD REQUIREMENT — if the file is .docx/.doc/.odt and
    //    conversion is configured, it MUST succeed or the upload is rejected.
    //    The teacher is shown an error modal, and admins get an email + in-app
    //    notification. The original file is NOT saved to R2 or D1.
    let conversionStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
    let r2PdfKey: string | null = null;
    let pdfUrl: string | null = null;

    if (format.isConvertible) {
      // 2026-09-06: Read iLoveAPI config from the ApiProvider DB table first
      // (the user can set this via /admin/fournisseurs), then fall back to env vars.
      let iLovePublicKey = process.env.I_LOVE_API_PUBLIC_KEY || '';
      let iLoveSecretKey = process.env.I_LOVE_API_SECRET_KEY || '';
      try {
        const { d1First } = await import('@/lib/db-d1');
        const { decryptSecret } = await import('@/lib/provider-keys');
        const dbProvider: any = await d1First(
          "SELECT publicKey, secretKey, isActive FROM ApiProvider WHERE type = 'iloveapi' LIMIT 1"
        );
        if (dbProvider && dbProvider.isActive && dbProvider.publicKey) {
          iLovePublicKey = dbProvider.publicKey;
          iLoveSecretKey = dbProvider.secretKey ? decryptSecret(dbProvider.secretKey) : '';
          console.log('[upload] Using iLoveAPI config from ApiProvider DB');
        }
      } catch (e) {
        console.warn('[upload] Failed to read iLoveAPI config from DB:', (e as Error).message);
      }
      if (!iLovePublicKey || !iLoveSecretKey) {
        // Clean up the R2 original upload (we're going to fail the request)
        try {
          await bucket.delete(originalKey);
        } catch (e) {
          console.warn('[upload] Failed to clean up R2 original after missing keys:', e);
        }
        console.warn('[upload] iLoveAPI keys missing — rejecting .docx/.doc/.odt upload');
        return NextResponse.json(
          {
            error: 'CONVERSION_NOT_CONFIGURED',
            message: 'La conversion Office→PDF n\'est pas configurée. Ajoutez vos clés iLovePDF dans Admin > Fournisseurs, ou uploadez un fichier PDF.',
          },
          { status: 422 },
        );
      }
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
        const errorMsg = e?.message || 'erreur inconnue';
        console.error('[upload] iLoveAPI conversion failed:', errorMsg);

        // Clean up the R2 original upload (we're going to fail the request)
        try {
          await bucket.delete(originalKey);
        } catch (cleanupErr) {
          console.warn('[upload] Failed to clean up R2 original after conversion failure:', cleanupErr);
        }

        // Notify admins (fire-and-forget — don't block the response on this)
        try {
          const { notifyAdminsConversionFailed } = await import('@/lib/admin-notify');
          await notifyAdminsConversionFailed({
            teacherId,
            fileName: file.name,
            originalFormat: format.format,
            errorMessage: errorMsg,
            resourceId: null,
          });
        } catch (notifyErr) {
          console.error('[upload] Failed to notify admins of conversion failure:', notifyErr);
        }

        return NextResponse.json(
          {
            error: 'CONVERSION_FAILED',
            message: `La conversion de "${file.name}" en PDF a échoué : ${errorMsg}. Votre fichier n'a pas été enregistré. L'administrateur a été notifié.`,
            details: errorMsg,
          },
          { status: 422 },
        );
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

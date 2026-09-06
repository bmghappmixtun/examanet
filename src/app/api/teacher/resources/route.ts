// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction } from '@/lib/security';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run, genId } from '@/lib/db-d1';
import { properSlugify } from '@/lib/slugify';
import { autoGenerateTags } from '@/lib/auto-tagger';

export const maxDuration = 60;

async function getNextNumericId(db: any): Promise<number> {
  const r = await db.prepare('SELECT MAX(numericId) as max FROM Resource').first();
  return Number(r?.max || 0) + 1;
}

export async function POST(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });
    }
    if (user.role === 'TEACHER' && user.status === 'PENDING_FILE_VERIFICATION') {
      return NextResponse.json(
        {
          error:
            "Vous devez d'abord soumettre vos 5 fichiers de vérification avant de pouvoir publier des ressources.",
          code: 'PENDING_FILE_VERIFICATION',
        },
        { status: 403 },
      );
    }
    if (user.role === 'TEACHER' && user.status === 'PENDING_APPROVAL') {
      return NextResponse.json(
        { error: "Votre compte est en attente d'approbation par l'administrateur." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      title,
      description = null,
      type,
      subject: subjectSlug,
      class: classSlug,
      section: sectionSlug = null,
      trimester = null,
      year = null,
      tags = null,
      fileKey = null,
      fileUrl = null,
      fileSize = 0,
      libraryFileId = null,
      homeworkSubtype = null,
      homeworkNumber = null,
      schoolType = null,
      product = null,
      hasCorrection = false,
      correctionSummary = null,
    } = body;

    if (!title || !type || !subjectSlug || !classSlug) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    // Validate subject / class / section
    const subjectRec = await d1First('SELECT id, slug FROM Subject WHERE slug = ?', subjectSlug);
    const classRec = await d1First('SELECT id, slug FROM "Class" WHERE slug = ?', classSlug);
    if (!subjectRec || !classRec) {
      return NextResponse.json({ error: 'Matière ou classe invalide' }, { status: 400 });
    }
    const sectionRec = sectionSlug
      ? await d1First('SELECT id, slug FROM Section WHERE slug = ?', sectionSlug)
      : null;

    // Get D1 context
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;

    // Resolve file URL/Key: prefer library file's data
    let finalFileKey = fileKey;
    let finalFileUrl = fileUrl;
    let finalFileSize: number = fileSize || 0;
    // 2026-09-06: Page count is no longer hardcoded to 10 — it's parsed
    // from the actual PDF so the resource card shows the right value.
    // Defaults to 1 if we can't determine it.
    let finalPageCount = 1;
    // 2026-09-06: When publishing a library file that was converted to PDF,
    // we MUST use the PDF key as the resource's fileKey — otherwise the public
    // viewer will try to display a .docx file as if it were a PDF ("Invalid
    // PDF structure"). The original docx is preserved as originalFileKey
    // so the teacher can still download the source file.
    let finalOriginalFileKey: string | null = null;
    let finalOriginalFileName: string | null = null;
    if (libraryFileId) {
      const libFile = await d1First(
        'SELECT id, teacherId, resourceId, fileName, fileKey, fileUrl, fileSize, r2Key, r2PdfKey, mimeType, isActive FROM TeacherFile WHERE id = ?',
        libraryFileId,
      );
      if (!libFile || libFile.teacherId !== user.id) {
        return NextResponse.json({ error: 'Fichier de bibliothèque invalide' }, { status: 400 });
      }
      if (libFile.resourceId) {
        return NextResponse.json(
          { error: 'Ce fichier a déjà été utilisé pour publier une ressource' },
          { status: 409 },
        );
      }
      // Prefer the PDF key (r2PdfKey) for the published resource so the public
      // viewer can render it. Fall back to the original fileKey only if no PDF
      // was generated (e.g. the file was already a PDF, or conversion was skipped).
      if (libFile.r2PdfKey) {
        finalOriginalFileKey = libFile.fileKey;
        finalOriginalFileName = libFile.fileName;
        finalFileKey = libFile.r2PdfKey;
        finalFileUrl = `/api/files/${libFile.r2PdfKey}`;
        // 2026-09-06: also fetch the actual page count from the PDF (was
        // hardcoded to 10 before, showing wrong info in the resource card).
        try {
          const { getCloudflareContext } = await import('@opennextjs/cloudflare');
          const ctx = await getCloudflareContext({ async: true });
          const bucket = (ctx as any).env?.PDFS_BUCKET as R2Bucket | undefined;
          if (bucket) {
            const headObj = await bucket.head(libFile.r2PdfKey);
            if (headObj) finalFileSize = headObj.size;
            // Download the PDF to count pages
            const pdfObj = await bucket.get(libFile.r2PdfKey);
            if (pdfObj) {
              const buf = await pdfObj.arrayBuffer();
              const { countPdfPages } = await import('@/lib/pdf-utils');
              const pages = countPdfPages(buf);
              if (pages && pages > 0) finalPageCount = pages;
            }
          }
        } catch (e) {
          console.warn('[publish] Failed to read PDF metadata from R2:', (e as Error).message);
        }
      } else {
        finalFileKey = libFile.fileKey;
        finalFileUrl = libFile.fileUrl;
        finalFileSize = libFile.fileSize || 0;
        // For non-PDF uploads (rare, legacy), try counting pages anyway
        // since some PDFs are stored without r2PdfKey (e.g. uploaded before
        // the conversion feature was added)
        if (libFile.fileKey?.toLowerCase().endsWith('.pdf')) {
          try {
            const { getCloudflareContext } = await import('@opennextjs/cloudflare');
            const ctx = await getCloudflareContext({ async: true });
            const bucket = (ctx as any).env?.PDFS_BUCKET as R2Bucket | undefined;
            if (bucket) {
              const pdfObj = await bucket.get(libFile.fileKey);
              if (pdfObj) {
                const buf = await pdfObj.arrayBuffer();
                const { countPdfPages } = await import('@/lib/pdf-utils');
                const pages = countPdfPages(buf);
                if (pages && pages > 0) finalPageCount = pages;
              }
            }
          } catch (e) {
            console.warn('[publish] Failed to read legacy PDF pages:', (e as Error).message);
          }
        }
      }
    }

    if (!finalFileKey || !finalFileUrl) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni. Uploadez d\'abord un fichier dans votre bibliothèque.' },
        { status: 400 },
      );
    }

    // Build slug
    const slug = properSlugify(title);
    const resourceId = genId();
    const numericId = await getNextNumericId(db);
    const now = Date.now();

    // Auto-generate SEO tags
    const autoTags = autoGenerateTags({
      title,
      subjectSlug: subjectRec.slug,
      classSlug: classRec.slug,
      sectionSlug: sectionRec?.slug,
      type,
      year,
      trimester,
      homeworkSubtype: type === 'DEVOIR' ? homeworkSubtype : null,
      homeworkNumber,
      hasCorrection: hasCorrection === true || hasCorrection === 'true',
    });
    const finalTags = Array.from(
      new Set([
        ...(tags
          ? String(tags).split(',').map((t) => t.trim()).filter(Boolean)
          : []),
        ...autoTags,
      ]),
    )
      .slice(0, 15)
      .join(',');

    // Validate homework fields
    const allowedSubtypes = ['CONTROLE', 'SYNTHESE', 'MAISON', 'REVISION'];
    const finalHomeworkSubtype = allowedSubtypes.includes(homeworkSubtype) ? homeworkSubtype : null;
    const finalHomeworkNumber =
      homeworkNumber && Number.isFinite(Number(homeworkNumber)) && Number(homeworkNumber) >= 1
        ? Number(homeworkNumber)
        : null;
    const allowedSchool = ['PUBLIC', 'PRIVATE', 'PILOTE'];
    const finalSchoolType = allowedSchool.includes(schoolType) ? schoolType : null;
    const finalProduct =
      product && typeof product === 'string' ? String(product).trim().substring(0, 200) : null;
    const finalHasCorrection = hasCorrection === true || hasCorrection === 'true';
    const finalCorrectionSummary =
      correctionSummary && typeof correctionSummary === 'string'
        ? String(correctionSummary).trim().substring(0, 500)
        : null;

    // Insert into D1
    await db
      .prepare(
        `INSERT INTO Resource (
          id, numericId, slug, title, description, type, status,
          fileKey, fileUrl, fileSize, pageCount,
          subjectId, classId, sectionId, teacherId,
          trimester, year, tags, language,
          homeworkSubtype, homeworkNumber, schoolType, hasCorrection,
          isHidden, isFeatured,
          viewsCount, downloadsCount, avgRating, ratingsCount, commentsCount, favoritesCount,
          originalFileKey, originalFileName,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL',
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, 'fr',
          ?, ?, ?, ?,
          0, 0,
          0, 0, 0, 0, 0, 0,
          ?, ?,
          ?, ?)`,
      )
      .bind(
        resourceId,
        numericId,
        slug,
        title,
        description,
        type,
        finalFileKey,
        finalFileUrl,
        finalFileSize,
        finalPageCount,
        subjectRec.id,
        classRec.id,
        sectionRec?.id || null,
        user.id,
        trimester,
        year,
        finalTags || null,
        finalHomeworkSubtype,
        finalHomeworkNumber,
        finalSchoolType,
        finalHasCorrection ? 1 : 0,
        finalOriginalFileKey,
        finalOriginalFileName,
        now,
        now,
      )
      .run();

    // Link library file → resource
    if (libraryFileId) {
      await d1Run('UPDATE TeacherFile SET resourceId = ?, updatedAt = ? WHERE id = ?', resourceId, now, libraryFileId);
    }

    // Notify admins (fire-and-forget)
    try {
      const { notifyAdminsNewResource } = await import('@/lib/admin-notify');
      await notifyAdminsNewResource(resourceId);
    } catch (e) {
      console.error('[teacher/resources] admin notify failed:', e);
    }

    return NextResponse.json({
      success: true,
      resource: {
        id: resourceId,
        numericId,
        slug,
        title,
        status: 'PENDING_APPROVAL',
        fileUrl: finalFileUrl,
        fileKey: finalFileKey,
      },
    });
  } catch (e: any) {
    console.error('[teacher/resources] POST', e);
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur' },
      { status: 500 },
    );
  }
}

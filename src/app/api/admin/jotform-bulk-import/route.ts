// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jotform-bulk-import
 *
 * Admin endpoint: bulk-import Jotform files into Examanet.
 *
 * Pipeline (5 steps, per file):
 *   1. Download from Jotform
 *   2. Convert DOCX to PDF via iLoveAPI (if office format)
 *   3. Upload to Vercel Blob (original + PDF for office)
 *   4. Create Resource in DB (status PUBLISHED)
 *   5. (Async) Generate AI metadata (generalSubject, KP, tags, summary)
 *
 * Body: {
 *   matches: Array<{
 *     sub: { form, submission_id, created_at, name, email, file_urls,
 *            file_names, type, classe, matiere, section, annee, sujet,
 *            correction, qui_etes_vous },
 *     user: { id, firstName, lastName, email }
 *   }>,
 *   generateAiMetadata: boolean,  // default true
 *   batchSize: number             // default 5 (parallel uploads)
 * }
 *
 * Returns: {
 *   total: N,
 *   imported: N,
 *   skipped: N,
 *   errors: [{ fileName, error }],
 *   resources: [{ resourceId, title, slug, fileName, teacherId, format }]
 * }
 *
 * Per user rule (2026-08-07): only imports files from teachers (Mr/Mme)
 * with valid email/name match in DB. Students and unknowns are skipped
 * by the caller (matches list is pre-filtered by the prep script).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import { properSlugify } from '@/lib/slugify';
import { convertDocxToPdf } from '@/lib/document-converter';

export const maxDuration = 300; // 5 min — bulk import
export const runtime = 'nodejs';

const JOTFORM_KEY = process.env.JOTFORM_API_KEY || '7312267369dbfc1c06dab2cf7cba4dc1';

function detectFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'docx', 'doc', 'odt', 'rtf', 'pptx', 'ppt', 'xlsx', 'xls'].includes(ext)) return ext;
  return ext || 'bin';
}

function isOfficeFormat(format: string): boolean {
  return ['docx', 'doc', 'odt', 'rtf', 'pptx', 'ppt', 'xlsx', 'xls'].includes(format);
}

/** Map the Jotform class string to a class slug we have in DB. */
function mapClassSlug(jotformClasse: string | null | undefined): string {
  if (!jotformClasse) return 'autre';
  const c = jotformClasse.toLowerCase().trim();
  if (c.includes('1ère') || c.includes('1ere') || c.includes('1as') || c.includes('1er')) return '1ere-secondaire';
  if (c.includes('2ème') || c.includes('2eme') || c.includes('2as')) return '2eme-secondaire';
  if (c.includes('3ème') || c.includes('3eme') || c.includes('3as')) return '3eme-secondaire';
  if (c.includes('bac') || c.includes('4ème') || c.includes('4eme') || c.includes('4as')) return '4eme-secondaire';
  if (c.includes('9ème') || c.includes('9eme') || c.includes('9e')) return '9eme';
  if (c.includes('8ème') || c.includes('8eme') || c.includes('8e')) return '8eme';
  if (c.includes('7ème') || c.includes('7eme') || c.includes('7e')) return '7eme';
  if (c.includes('6ème') || c.includes('6eme') || c.includes('6e')) return '6eme';
  return 'autre';
}

/** Map the Jotform type string to our enum. */
function mapResourceType(jotformType: string | null | undefined, filename: string): string {
  const t = (jotformType || '').toLowerCase();
  const f = filename.toLowerCase();
  if (/corrig[eé]/.test(t) || /corrig[eé]/.test(f) || /avec correction/.test(t)) return 'CORRECTION';
  if (/devoir.*contr[oô]le|^\s*dc| dc\b|controle/.test(t) || /contr[oô]le/.test(f)) return 'DEVOIR';
  if (/synth[èe]se|\bds\b|devoir.*synth/.test(t) || /synth[èe]se/.test(f)) return 'EXAM';
  if (/s[ée]rie.*exercice|exercice|^\s*se\b/.test(t) || /s[ée]rie/.test(f)) return 'EXERCISE';
  if (/cours|r[eé]vision/.test(t) || /cours/.test(f)) return 'COURSE';
  if (/r[eé]sum[eé]/.test(t) || /r[eé]sum[eé]/.test(f)) return 'SUMMARY';
  if (/fiche/.test(t) || /fiche/.test(f)) return 'CARD';
  if (/sujet.*bac|\bbac\b/.test(t) || /bac/.test(f)) return 'BAC_SUBJECT';
  return 'COURSE';
}

/** Map the Jotform subject string to our subject slug. */
function mapSubjectSlug(jotformMatiere: string | null | undefined, filename: string): string {
  const m = (jotformMatiere || '').toLowerCase().trim();
  const f = filename.toLowerCase();
  if (/math[eé]matiques|\bmath\b/.test(m) || /math[eé]matiques|\bmath\b/.test(f)) return 'mathematiques';
  if (/physique|phys|\bsciences phys/.test(m) || /physique|\bsciences phys/.test(f)) return 'physique';
  if (/\bsvt\b|sciences de la vie|sciences.*vie/.test(m) || /svt/.test(f)) return 'svt';
  if (/\barabe\b/.test(m) || /arabe/.test(f)) return 'arabe';
  if (/fran[çc]ais/.test(m) || /fran[çc]ais/.test(f)) return 'francais';
  if (/anglais/.test(m) || /anglais/.test(f)) return 'anglais';
  if (/histoire|hist/.test(m) || /hist/.test(f)) return 'histoire';
  if (/g[ée]ograph/.test(m) || /g[ée]ograph/.test(f)) return 'geographie';
  if (/philosophie|philo/.test(m) || /philo/.test(f)) return 'philosophie';
  if (/algo|programmation/.test(m) || /algo|programmation|python/.test(f)) return 'algo-prog';
  if (/informatique/.test(m) || /informatique/.test(f)) return 'informatique';
  if (/technologie|technique/.test(m) || /technique/.test(f)) return 'technologie';
  if (/g[eé]nie.*[eé]lectrique|[eé]lectricit[eé]/.test(m)) return 'genie-electrique';
  if (/g[eé]nie.*m[eé]canique|m[eé]canique/.test(m)) return 'genie-mecanique';
  if (/\beco|gestion|[eé]conomie/.test(m) || /eco|gestion/.test(f)) return 'eco-gestion';
  if (/\bespagnol|espagnol/.test(m) || /espagnol|spanish/.test(f)) return 'espagnol';
  return 'mathematiques'; // default
}

/** Build the canonical Examanet title format: BASE (year) : GS */
function buildTitle({
  baseType,
  baseSujet,
  baseClasse,
  baseSection,
  baseYear,
  generalSubject,
}: {
  baseType: string;
  baseSujet: string;
  baseClasse: string;
  baseSection: string | null;
  baseYear: string;
  generalSubject: string | null;
}): string {
  // Format: {Type} - {Sujet} - {Classe} {Section} ({year}) : {GS}
  const parts: string[] = [];
  parts.push(baseType);
  parts.push(baseSujet);
  parts.push(baseClasse);
  if (baseSection) parts.push(baseSection);
  const yearPart = baseYear ? `(${baseYear})` : '';
  const base = parts.join(' - ') + (yearPart ? ' ' + yearPart : '');
  return generalSubject ? `${base} : ${generalSubject}` : base;
}

type Match = {
  sub: any;
  user: { id: string; firstName: string; lastName: string; email: string };
};

export async function POST(req: NextRequest) {
  try {
    // Auth: ADMIN role OR SEED_TOKEN (for scripts/automation)
    const seedToken = req.nextUrl.searchParams.get('seedToken') || req.nextUrl.searchParams.get('token') ||
      req.headers.get('x-seed-token') ||
      req.cookies.get('seed-token')?.value;
    const user = await getCurrentUser();
    const isAdmin = user && user.role === 'ADMIN';
    const isSeed = seedToken && seedToken === process.env.SEED_TOKEN;
    if (!isAdmin && !isSeed) {
      if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
      return NextResponse.json({ error: 'Admin requis' }, { status: 403 });
    }

    const body = await req.json();
    const matches: Match[] = body.matches || [];
    const generateAiMetadata = body.generateAiMetadata !== false;
    const batchSize = Math.min(10, body.batchSize || 5);

    if (matches.length === 0) {
      return NextResponse.json({ error: 'Aucun match fourni' }, { status: 400 });
    }

    console.log(`[jotform-bulk] Starting import of ${matches.length} files`);

    // Pre-fetch all subjects and classes for ID lookups
    const [subjects, classes] = await Promise.all([
      prisma.subject.findMany(),
      prisma.class.findMany({ include: { level: true } }),
    ]);
    const subjectBySlug = new Map(subjects.map((s) => [s.slug, s]));
    const classBySlug = new Map(classes.map((c) => [c.slug, c]));

    const imported: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    // Resolve admin user ID (could be null if using SEED_TOKEN)
    let adminId: string | null = user?.id || null;
    if (!adminId) {
      const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      adminId = admin?.id || null;
    }
    if (!adminId) {
      return NextResponse.json({ error: 'Admin user not found' }, { status: 500 });
    }

    // Flatten all files (each match can have multiple files)
    const allFiles: { match: Match; fileUrl: string; fileName: string }[] = [];
    for (const m of matches) {
      for (let i = 0; i < (m.sub.file_urls || []).length; i++) {
        const fileUrl = m.sub.file_urls[i];
        const fileName = m.sub.file_names?.[i] || fileUrl.split('/').pop() || 'file';
        allFiles.push({ match: m, fileUrl, fileName });
      }
    }
    console.log(`[jotform-bulk] Total files to process: ${allFiles.length}`);

    // Process in batches
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);
      await Promise.all(batch.map((f) => processFile(f, {
        subjectBySlug, classBySlug, generateAiMetadata, imported, skipped, errors,
        adminId,
      })));
    }

    console.log(`[jotform-bulk] Done. imported=${imported.length} skipped=${skipped.length} errors=${errors.length}`);

    return NextResponse.json({
      success: true,
      total: allFiles.length,
      imported: imported.length,
      skipped: skipped.length,
      errors: errors.length,
      resources: imported,
      skippedList: skipped,
      errorsList: errors,
    });
  } catch (e: any) {
    console.error('[jotform-bulk] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function processFile(
  file: { match: Match; fileUrl: string; fileName: string },
  ctx: {
    subjectBySlug: Map<string, any>;
    classBySlug: Map<string, any>;
    generateAiMetadata: boolean;
    imported: any[];
    skipped: any[];
    errors: any[];
    adminId: string;
  },
) {
  const { match, fileUrl, fileName } = file;
  const teacher = match.user;
  const sub = match.sub;

  try {
    console.log(`[jotform-bulk] Processing: ${fileName} for teacher ${teacher.email}`);

    // STEP 1: Download from Jotform
    const dlRes = await fetch(fileUrl);
    if (!dlRes.ok) {
      throw new Error(`Jotform download failed: ${dlRes.status}`);
    }
    const originalBuffer = Buffer.from(await dlRes.arrayBuffer());
    if (originalBuffer.length === 0) {
      throw new Error('Empty file from Jotform');
    }

    const format = detectFormat(fileName);
    const isOffice = isOfficeFormat(format);

    // Validate PDF magic bytes for PDF
    if (format === 'pdf' && originalBuffer.slice(0, 4).toString() !== '%PDF') {
      throw new Error('Not a valid PDF (bad magic bytes)');
    }

    // STEP 2: Convert DOCX to PDF via iLoveAPI
    let pdfBuffer: Buffer | null = null;
    if (isOffice) {
      console.log(`[jotform-bulk] Converting ${format} → PDF via iLoveAPI...`);
      try {
        const result = await convertDocxToPdf(originalBuffer, { fileName });
        if (result.pdfBuffer) {
          pdfBuffer = result.pdfBuffer;
          console.log(`[jotform-bulk] Conversion OK via ${result.provider} (${result.pdfSize} bytes)`);
        } else {
          console.warn(`[jotform-bulk] Conversion failed: ${result.warnings.join('; ')}`);
        }
      } catch (e: any) {
        console.error(`[jotform-bulk] iLoveAPI conversion error:`, e.message);
        // Continue with original only (no PDF)
      }
    }

    // STEP 3: Upload to Vercel Blob
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._\-]/g, '_');
    const submissionId = sub.submission_id || 'unknown';
    const safeBase = baseName.slice(0, 60);

    // Upload original (always with random suffix to avoid collisions on retry)
    const originalKey = `teacher-library/${teacher.id}/jotform/${submissionId}-${safeBase}-orig.${format}`;
    const originalBlob = await put(originalKey, originalBuffer, {
      access: 'public',
      addRandomSuffix: true,
    });

    // Upload PDF (either original was PDF, or we converted it)
    const pdfKey = `teacher-library/${teacher.id}/jotform/${submissionId}-${safeBase}.pdf`;
    const pdfBlob: { url: string; pathname: string; size: number } | null = pdfBuffer
      ? await put(pdfKey, pdfBuffer, { access: 'public', addRandomSuffix: true }).then((b) => ({
          url: b.url, pathname: b.pathname, size: pdfBuffer!.length,
        }))
      : format === 'pdf'
        ? { url: originalBlob.url, pathname: originalBlob.pathname, size: originalBuffer.length }
        : null;

    // STEP 4: Create TeacherFile + Resource
    const teacherFile = await prisma.teacherFile.create({
      data: {
        teacherId: teacher.id,
        fileName: fileName,
        originalFormat: format,
        fileKey: originalBlob.pathname,
        fileUrl: originalBlob.url,
        fileSize: originalBuffer.length,
        pdfKey: pdfBlob?.pathname || null,
        pdfUrl: pdfBlob?.url || null,
        pdfSize: pdfBlob?.size || null,
        conversionStatus: format === 'pdf' ? 'NOT_NEEDED' : pdfBuffer ? 'SUCCESS' : 'FAILED',
        notes: `Jotform ${sub.form} #${submissionId} (${sub.created_at?.slice(0, 10) || '?'})`,
      },
    });

    // Map class/subject/type from Jotform
    const classSlug = mapClassSlug(sub.classe);
    const subjectSlug = mapSubjectSlug(sub.matiere, fileName);
    const resType = mapResourceType(sub.type, fileName);
    const classObj = ctx.classBySlug.get(classSlug);
    const subjectObj = ctx.subjectBySlug.get(subjectSlug);

    if (!classObj) {
      console.warn(`[jotform-bulk] Class not found for slug: ${classSlug} (from "${sub.classe}")`);
    }

    // Auto-create subject if missing (schema requires non-null subjectId)
    let finalSubject = subjectObj;
    if (!finalSubject) {
      console.log(`[jotform-bulk] Subject "${subjectSlug}" not in DB, auto-creating...`);
      const cleanSlug = subjectSlug.replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'imported';
      const safeName = subjectSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
      try {
        finalSubject = await prisma.subject.create({
          data: {
            slug: cleanSlug,
            nameFr: safeName,
            nameAr: safeName,
            order: 999,
          },
        });
        ctx.subjectBySlug.set(subjectSlug, finalSubject);
        console.log(`[jotform-bulk] Created subject: ${finalSubject.slug} (${finalSubject.id})`);
      } catch (e: any) {
        // If slug collision, try with suffix
        console.warn(`[jotform-bulk] Subject create failed: ${e.message} — falling back to mathematiques`);
        finalSubject = ctx.subjectBySlug.get('mathematiques');
        if (!finalSubject) {
          throw new Error('Mathematiques subject not in DB — cannot fallback');
        }
      }
    }

    // Build title
    const baseTypeFr: Record<string, string> = {
      COURSE: 'Cours',
      EXERCISE: "Série d'exercices",
      DEVOIR: 'Devoir de Contrôle',
      EXAM: 'Devoir de Synthèse',
      CORRECTION: 'Corrigé',
      SUMMARY: 'Résumé',
      CARD: 'Fiche',
      BAC_SUBJECT: 'Sujet Bac',
    };
    const baseType = baseTypeFr[resType] || 'Document';
    const baseClasse = classObj?.nameFr || sub.classe || 'Classe';
    const baseSection = sub.section || null;
    const baseYear = sub.annee || '2025-2026';
    const baseSujet = finalSubject?.nameFr || 'Document';

    // For now, use filename as generalSubject placeholder (Step 5 will generate real GS via AI)
    const initialGs = sub.sujet || null;
    const title = buildTitle({
      baseType,
      baseSujet,
      baseClasse,
      baseSection,
      baseYear,
      generalSubject: initialGs,
    });

    const slug = properSlugify(title).slice(0, 80) || `jotform-${submissionId}`;

    // Create the Resource
    const resource = await prisma.resource.create({
      data: {
        title,
        slug: `${slug}-${teacher.id.slice(-6)}`.slice(0, 90),
        description: sub.sujet || '',
        type: resType as any,
        status: 'PUBLISHED',
        fileKey: pdfBlob?.pathname || originalBlob.pathname,
        fileUrl: pdfBlob?.url || originalBlob.url,
        fileSize: pdfBlob?.size || originalBuffer.length,
        originalFileKey: originalBlob.pathname,
        originalFileName: fileName,
        originalFormat: format,
        originalFileSize: originalBuffer.length,
        libraryFileId: teacherFile.id,
        teacherId: teacher.id,
        subjectId: finalSubject?.id || null,
        classId: classObj?.id || null,
        trimester: null,
        year: baseYear,
        approvedById: ctx.adminId,
        approvedAt: new Date(),
        publishedAt: new Date(),
        schoolType: null,
        hasCorrection: sub.correction ? true : false,
        // Will be filled by Step 5: AI metadata
        descriptionSource: 'jotform-import',
        descriptionGeneratedAt: new Date(),
      },
    });

    // Link teacherFile.resourceId
    await prisma.teacherFile.update({
      where: { id: teacherFile.id },
      data: { resourceId: resource.id },
    });

    ctx.imported.push({
      resourceId: resource.id,
      numericId: resource.numericId,
      title: resource.title,
      slug: resource.slug,
      fileName,
      teacherId: teacher.id,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      format,
      hasPdf: !!pdfBlob,
      hasOriginal: true,
    });

    console.log(`[jotform-bulk] ✅ Imported #${resource.numericId} ${fileName}`);
  } catch (e: any) {
    console.error(`[jotform-bulk] ❌ Error on ${fileName}:`, e.message);
    ctx.errors.push({
      fileName,
      teacherId: teacher.id,
      error: e.message,
    });
  }
}

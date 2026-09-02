// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jotform-migrate
 *
 * Admin endpoint: download a single file from JotForm and import it
 * into Examanet (TeacherFile + Resource records).
 *
 * Body: {
 *   teacherId: string,
 *   fileUrl: string,
 *   fileName: string,
 *   submissionId: string,
 *   formName: string,
 *   createdAt: string  // ISO date
 * }
 *
 * Returns: { teacherFileId, resourceId, fileKey, fileUrl, skipped?, error? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';

export const maxDuration = 60;
export const runtime = 'nodejs';

function detectFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'docx', 'doc', 'odt', 'rtf', 'pptx', 'ppt', 'xlsx', 'xls'].includes(ext)) return ext;
  return ext || 'bin';
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Admin requis' }, { status: 403 });

    const body = await req.json();
    const { teacherId, fileUrl, fileName, submissionId, formName, createdAt } = body;

    if (!teacherId || !fileUrl || !fileName) {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
    }

    // Check teacher exists
    const teacher = await prisma.user.findUnique({ where: { id: teacherId } });
    if (!teacher) return NextResponse.json({ error: 'Teacher introuvable' }, { status: 404 });
    if (teacher.role !== 'TEACHER' && teacher.role !== 'ADMIN') {
      return NextResponse.json({ error: "User n'est pas teacher" }, { status: 400 });
    }

    // Check if already imported (by source URL hash)
    const filename = decodeURIComponent(fileName);
    const format = detectFormat(filename);

    // Download from JotForm
    const dlRes = await fetch(fileUrl);
    if (!dlRes.ok)
      return NextResponse.json({ error: `Download failed: ${dlRes.status}` }, { status: 502 });
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    if (buffer.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 502 });

    // Verify PDF magic bytes if PDF
    if (format === 'pdf' && buffer.slice(0, 4).toString() !== '%PDF') {
      return NextResponse.json({ error: 'Not a valid PDF' }, { status: 502 });
    }

    // Upload to Vercel Blob
    const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const key = `teacher-library/${teacherId}/jotform/${submissionId}-${Date.now()}-${safeName}`;
    const blob = await put(key, buffer, {
      access: 'public',
      addRandomSuffix: false,
    });

    // Create TeacherFile
    const teacherFile = await prisma.teacherFile.create({
      data: {
        teacherId,
        fileName: filename,
        originalFormat: format,
        fileKey: blob.pathname,
        fileUrl: blob.url,
        fileSize: buffer.length,
        pdfKey: format === 'pdf' ? blob.pathname : null,
        pdfUrl: format === 'pdf' ? blob.url : null,
        pdfSize: format === 'pdf' ? buffer.length : null,
        conversionStatus: format === 'pdf' ? 'NOT_NEEDED' : 'PENDING',
        notes: `JotForm ${formName} #${submissionId} (${createdAt?.slice(0, 10) || '?'})`,
      },
    });

    // Detect subject from filename (default: mathematiques)
    const fnameLower = filename.toLowerCase();
    let subjectSlug = 'mathematiques';
    if (/physique|phys\b/i.test(fnameLower)) subjectSlug = 'physique';
    else if (/svt|sciences de la vie/i.test(fnameLower)) subjectSlug = 'svt';
    else if (/arabe/i.test(fnameLower)) subjectSlug = 'arabe';
    else if (/fran[çc]ais/i.test(fnameLower)) subjectSlug = 'francais';
    else if (/anglais/i.test(fnameLower)) subjectSlug = 'anglais';
    else if (/histoire/i.test(fnameLower)) subjectSlug = 'histoire';
    else if (/g[ée]ograph/i.test(fnameLower)) subjectSlug = 'geographie';
    else if (/philosophie/i.test(fnameLower)) subjectSlug = 'philosophie';
    else if (/algo|programmation/i.test(fnameLower)) subjectSlug = 'algo-prog';
    else if (/informatique/i.test(fnameLower)) subjectSlug = 'informatique';
    const subject = await prisma.subject.findUnique({ where: { slug: subjectSlug } });

    // Detect type
    let resType = 'COURSE';
    if (/contr[ôo]le|^\s*dc| dc\b/i.test(fnameLower)) resType = 'DEVOIR';
    else if (/synth[èe]se|\bds\b/i.test(fnameLower)) resType = 'EXAM';
    else if (/examen|bac/i.test(fnameLower)) resType = 'EXAM';
    else if (/exercice/i.test(fnameLower)) resType = 'EXERCISE';
    else if (/cours/i.test(fnameLower)) resType = 'COURSE';

    // Create Resource (auto-published, no subject attribution)
    const resource = await prisma.resource.create({
      data: {
        title: filename.replace(/\.[^.]+$/, ''),
        slug: `jotform-${submissionId}-${Date.now()}`.slice(0, 60),
        description: '',
        type: resType,
        status: 'PUBLISHED',
        fileKey: blob.pathname,
        fileUrl: blob.url,
        fileSize: buffer.length,
        originalFileKey: blob.pathname,
        originalFileName: filename,
        originalFormat: format,
        originalFileSize: buffer.length,
        libraryFileId: teacherFile.id,
        teacherId: teacherId,
        subjectId: subject?.id || (await prisma.subject.findFirst())!.id,
        approvedById: user.id,
        approvedAt: new Date(),
        publishedAt: new Date(),
      },
    });

    // Link teacherFile.resourceId
    await prisma.teacherFile.update({
      where: { id: teacherFile.id },
      data: { resourceId: resource.id },
    });

    return NextResponse.json({
      success: true,
      teacherFileId: teacherFile.id,
      resourceId: resource.id,
      fileKey: blob.pathname,
      fileUrl: blob.url,
      format,
      size: buffer.length,
    });
  } catch (e: any) {
    console.error('jotform-migrate error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

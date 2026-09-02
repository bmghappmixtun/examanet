// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { uploadFile } from '@/lib/storage';
import { detectFormat } from '@/lib/document-converter';
import { sendAdminVerificationFilesEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 5;
const ALLOWED_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/pdf',
];
const ALLOWED_EXTENSIONS = ['docx', 'doc', 'pdf'];

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

function newId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const db = await getD1();
    if (!db) return NextResponse.json({ files: [], request: null });

    const [filesResult, teacher] = await Promise.all([
      db.prepare('SELECT * FROM TeacherVerificationFile WHERE teacherId = ? ORDER BY uploadedAt DESC').bind(user.id).all(),
      db.prepare("SELECT status, verificationFilesRequestedAt, verificationFilesNote, verificationFilesReceivedAt FROM User WHERE id = ?").bind(user.id).first(),
    ]);

    const files = (filesResult?.results || []).map((f: any) => ({
      ...f,
      uploadedAt: f.uploadedAt ? new Date(f.uploadedAt).toISOString() : null,
      reviewedAt: f.reviewedAt ? new Date(f.reviewedAt).toISOString() : null,
    }));

    return NextResponse.json({
      files,
      request: teacher ? {
        status: (teacher as any).status,
        requestedAt: (teacher as any).verificationFilesRequestedAt,
        note: (teacher as any).verificationFilesNote,
        receivedAt: (teacher as any).verificationFilesReceivedAt,
        maxFiles: MAX_FILES,
        remaining: Math.max(0, MAX_FILES - files.length),
      } : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'TEACHER')
      return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });

    const db = await getD1();
    if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

    const teacher: any = await db.prepare(
      "SELECT status, verificationFilesRequestedAt FROM User WHERE id = ?"
    ).bind(user.id).first();

    if (teacher?.status !== 'PENDING_FILE_VERIFICATION') {
      return NextResponse.json({ error: "Vous n'êtes pas en attente de vérification de fichiers." }, { status: 400 });
    }

    const countResult: any = await db.prepare(
      "SELECT COUNT(*) as c FROM TeacherVerificationFile WHERE teacherId = ?"
    ).bind(user.id).first();
    if ((countResult?.c || 0) >= MAX_FILES) {
      return NextResponse.json({ error: `Vous avez déjà atteint la limite de ${MAX_FILES} fichiers.` }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Le fichier dépasse la taille maximale (${MAX_FILE_SIZE / 1024 / 1024} MB).` }, { status: 400 });
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Format non supporté. Formats acceptés : .docx, .doc, .pdf' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const format = detectFormat(file.name, file.type);

    const safeName = file.name.replace(/[^a-zA-Z0-9.-_]/g, '_').slice(0, 100);
    const key = `verification/${user.id}/${Date.now()}-${safeName}`;
    const { url: fileUrl } = await uploadFile(key, fileBuffer, file.type);

    const fileId = newId('cuvf');
    const now = Date.now();
    const type = (formData.get('type') as string) || 'OTHER';
    const description = (formData.get('description') as string) || null;
    const year = (formData.get('year') as string) || null;

    await db.prepare(`
      INSERT INTO TeacherVerificationFile (id, fileName, originalFormat, fileKey, fileUrl, fileSize, type, description, year, teacherId, reviewedByAdmin, uploadedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).bind(fileId, file.name, format, key, fileUrl, file.size, type, description, year, user.id, now).run();

    // Update teacher status
    await db.prepare(
      "UPDATE User SET verificationFilesReceivedAt = ?, status = 'PENDING_REVIEW', updatedAt = ? WHERE id = ?"
    ).bind(now, now, user.id).run();

    // Send email to admin
    try {
      const admin: any = await db.prepare("SELECT email FROM User WHERE role = 'ADMIN' LIMIT 1").first();
      if (admin?.email) {
        await sendAdminVerificationFilesEmail({
          to: admin.email,
          teacherName: `${user.firstName} ${user.lastName}`,
          fileCount: (countResult?.c || 0) + 1,
          teacherId: user.id,
          locale: 'fr',
        });
      }
    } catch (e) {
      console.error('[verification-files] admin email failed:', e);
    }

    return NextResponse.json({ id: fileId, fileUrl, success: true });
  } catch (e: any) {
    console.error('[verification-files POST] error:', e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

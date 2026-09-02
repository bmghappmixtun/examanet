// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { uploadFile } from '@/lib/storage';
import { sendNewEditPendingEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getD1();
    if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

    const resource: any = await db.prepare('SELECT * FROM Resource WHERE id = ?').bind(id).first();
    if (!resource) return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });

    if (user.role !== 'ADMIN' && resource.teacherId !== user.id) {
      return NextResponse.json({ error: "Vous n'êtes pas le propriétaire" }, { status: 403 });
    }

    if (resource.editStatus === 'PENDING_EDIT_APPROVAL') {
      return NextResponse.json({ error: "Une modification est déjà en attente d'approbation." }, { status: 409 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Le fichier doit être un PDF' }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 50 MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'pdf';
    const fileName = `resources/${id}/pending-${Date.now()}.${ext}`;
    const uploadResult: any = await uploadFile(fileName, buffer, 'application/pdf');
    const fileUrl = uploadResult.url || uploadResult;
    const fileKey = uploadResult.key || fileName;

    const currentPending = (() => {
      try {
        return resource.pendingEdit ? (typeof resource.pendingEdit === 'string' ? JSON.parse(resource.pendingEdit) : resource.pendingEdit) : {};
      } catch { return {}; }
    })();
    const newPending = {
      ...currentPending,
      fileKey,
      fileUrl,
      fileSize: file.size,
    };

    if (user.role === 'ADMIN') {
      await db.prepare(
        'UPDATE Resource SET fileKey = ?, fileUrl = ?, fileSize = ?, updatedAt = ? WHERE id = ?'
      ).bind(fileKey, fileUrl, file.size, Date.now(), id).run();
    } else {
      await db.prepare(
        "UPDATE Resource SET editStatus = 'PENDING_EDIT_APPROVAL', pendingEdit = ?, editRequestedAt = ?, editRequestedById = ?, updatedAt = ? WHERE id = ?"
      ).bind(JSON.stringify(newPending), Date.now(), user.id, Date.now(), id).run();

      // Send email to admin
      try {
        const admin: any = await db.prepare("SELECT email FROM User WHERE role = 'ADMIN' LIMIT 1").first();
        if (admin?.email) {
          await sendNewEditPendingEmail({
            to: admin.email,
            teacherName: `${user.firstName} ${user.lastName}`,
            resourceTitle: resource.title,
            resourceId: id,
            locale: 'fr',
          });
        }
      } catch (e) {
        console.error('[file] admin email failed:', e);
      }
    }

    return NextResponse.json({ success: true, fileKey, fileUrl });
  } catch (e: any) {
    console.error('[file POST] error:', e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

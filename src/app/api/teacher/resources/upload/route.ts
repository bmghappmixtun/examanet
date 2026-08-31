// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const maxDuration = 60;

/**
 * POST /api/teacher/resources/upload
 * Step 1 of resource creation: upload the file to R2, get back the fileKey/fileUrl.
 * Step 2 (POST /api/teacher/resources) creates the resource record.
 *
 * D1 + R2 implementation (CF Workers compatible).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Le fichier doit être un PDF' }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 50 MB)' }, { status: 400 });
    }

    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const bucket = (ctx as any).env.PDFS_BUCKET as R2Bucket | undefined;
    if (!bucket) {
      return NextResponse.json({ error: 'Stockage R2 non configuré' }, { status: 500 });
    }

    const ext = file.name.split('.').pop() || 'pdf';
    const fileName = `resources/pending/${user.id}-${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    await bucket.put(fileName, arrayBuffer, {
      httpMetadata: { contentType: 'application/pdf' },
    });
    const fileUrl = `/api/files/${fileName}`;

    return NextResponse.json({
      success: true,
      fileKey: fileName,
      fileUrl,
      fileSize: file.size,
      fileName: file.name,
    });
  } catch (e: any) {
    console.error('Upload error:', e);
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur' },
      { status: 500 },
    );
  }
}

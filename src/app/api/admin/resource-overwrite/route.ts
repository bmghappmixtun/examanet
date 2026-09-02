// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/resource-overwrite
 * Overwrite the file for an existing Resource with a new PDF.
 * Uses a NEW path to bypass Vercel Blob CDN cache (which is 30 days).
 *
 * Auto-detects hasCorrection via size heuristic (no external deps).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { put, del } from '@vercel/blob';

export const maxDuration = 60;
export const runtime = 'nodejs';

async function checkAdmin(req: NextRequest) {
  const seedToken = req.headers.get('x-seed-token') || req.nextUrl.searchParams.get('token');
  if (seedToken && seedToken === process.env.SEED_TOKEN) {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (admin) return admin;
  }
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') throw new Error('Admin requis');
  return user;
}

export async function POST(req: NextRequest) {
  try {
    await checkAdmin(req);

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data requis' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const resourceId = formData.get('resourceId') as string | null;

    if (!file || !resourceId) {
      return NextResponse.json({ error: 'file + resourceId requis' }, { status: 400 });
    }

    const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!resource) {
      return NextResponse.json({ error: 'Resource non trouvée' }, { status: 404 });
    }

    const oldKey = resource.fileKey;
    const oldUrl = resource.fileUrl;

    // Strategy: upload to NEW path with random suffix to bypass CDN cache
    // Then delete old blob (after confirming new is live)
    const pdfBuffer = Buffer.from(await file.arrayBuffer());

    // Get directory from old key (e.g., "teacher-library/teacherId/imported/")
    const keyDir =
      oldKey?.substring(0, oldKey.lastIndexOf('/') + 1) ||
      `teacher-library/${resource.teacherId}/imported/`;

    // New filename: timestamp + nanoid to ensure CDN freshness
    const newFilename = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}-${resourceId.substring(0, 6)}.pdf`;
    const newKey = `${keyDir}${newFilename}`;

    const blob = await put(newKey, pdfBuffer, {
      access: 'public',
      addRandomSuffix: false,
    });

    // ============================================================
    // AUTO-DETECT if the new file contains a correction
    // Heuristic (no external dependencies):
    //   1. If newSize > oldSize * 1.3, assume correction added
    //   2. Otherwise trust existing hasCorrection value
    // ============================================================
    const updateData: any = {
      fileKey: blob.pathname,
      fileUrl: blob.url,
      fileSize: pdfBuffer.length,
    };

    let detectedHasCorrection: boolean | null = null;
    let detectionMethod = 'no_change';

    const oldSize = resource.fileSize || 0;
    if (oldSize > 0 && pdfBuffer.length > oldSize * 1.3) {
      // File significantly bigger - likely merged énoncé+correction
      detectedHasCorrection = true;
      const ratio = (pdfBuffer.length / oldSize).toFixed(2);
      detectionMethod = `size_heuristic_grew:new=${pdfBuffer.length},old=${oldSize},ratio=${ratio}`;
    } else if (oldSize > 0 && pdfBuffer.length < oldSize * 0.7) {
      // File got significantly smaller - might be énoncé only replacement
      // Don't change hasCorrection; let the explicit update decide
      detectionMethod = `size_heuristic_shrank:new=${pdfBuffer.length},old=${oldSize}`;
    } else {
      // Similar size - keep existing value
      detectionMethod = `size_similar_kept:new=${pdfBuffer.length},old=${oldSize}`;
    }

    if (detectedHasCorrection === true) {
      updateData.hasCorrection = true;
      if (!resource.correctionSummary) {
        updateData.correctionSummary =
          `Le corrigé détaillé est intégré à la fin du document. Faites défiler pour le consulter.`;
      }
    }

    console.log(
      `[resource-overwrite] auto-detect: hasCorrection=${detectedHasCorrection} method=${detectionMethod}`
    );

    // Update resource with new key + auto-detected fields
    await prisma.resource.update({
      where: { id: resourceId },
      data: updateData,
    });

    // Also update TeacherFile
    await prisma.teacherFile.updateMany({
      where: { resourceId },
      data: {
        pdfUrl: blob.url,
        pdfSize: pdfBuffer.length,
      },
    });

    // Try to delete old blob (best effort - might fail if not yet expired)
    if (oldKey && oldKey !== blob.pathname) {
      try {
        await del(oldUrl);
      } catch (e) {
        // Ignore - old blob will expire naturally
      }
    }

    return NextResponse.json({
      success: true,
      resourceId,
      oldKey,
      newKey: blob.pathname,
      newUrl: blob.url,
      oldSize: resource.fileSize,
      newSize: pdfBuffer.length,
      sizeDelta: resource.fileSize - pdfBuffer.length,
      detected: {
        hasCorrection: detectedHasCorrection,
        method: detectionMethod,
      },
    });
  } catch (e: any) {
    console.error('[resource-overwrite]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

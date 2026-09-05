// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/resource/[id]/hard-delete
 *
 * 2026-09-05: Added for permanent cleanup of a resource.
 *
 * This is the **NUCLEAR** option — use it when you want to wipe a resource
 * from the platform completely:
 *   - Resource row from D1
 *   - ResourceContent, ResourceMetadata, ResourceSummary (AI-generated data)
 *   - All View, Download, Comment, Rating, Favorite, Share, Report rows
 *   - The linked TeacherFile (R2 file + DB row)
 *   - All R2 objects (fileKey, r2Key, thumbnailKey, originalFileKey, r2PdfKey)
 *   - Cache invalidation (resource-detail, analytics, etc.)
 *
 * Authorization: ADMIN only. This is irreversible.
 *
 * Use cases:
 *   - Resource has inappropriate content (DMCA, illegal, etc.)
 *   - Test data cleanup
 *   - GDPR right-to-be-forgotten requests
 *
 * For normal teacher cleanup (keep DB history), use:
 *   - Teacher: "Dépublier" → "Supprimer" the file from /enseignant/bibliotheque
 *   - Admin: /admin/ressources → delete the resource (keeps R2 + analytics)
 *
 * Returns a summary of everything that was deleted (for audit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';
import { invalidateCache } from '@/lib/kv-cache';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

async function getBucket() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.PDFS_BUCKET as R2Bucket | undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (isValidOrigin(req)) {
      // ok
    } else {
      return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
    }

    const me = await getCurrentUser();
    if (!me || me.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const { id } = await params;
    const db = await getD1();

    // Fetch the resource + everything we need to clean up
    const resource = await d1First(
      `SELECT id, numericId, slug, title, fileKey, fileUrl, r2Key, thumbnailKey,
              originalFileKey, teacherId
       FROM Resource WHERE id = ?`,
      id,
    );
    if (!resource) {
      return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
    }

    // Optional: require an explicit confirm text in the body
    let body: { confirm?: string } = {};
    try {
      body = await req.json();
    } catch {}
    if (body.confirm !== resource.title) {
      return NextResponse.json(
        {
          error: `Pour confirmer, envoyez { confirm: "${resource.title}" } dans le body.`,
          code: 'CONFIRM_REQUIRED',
          expected: resource.title,
        },
        { status: 400 },
      );
    }

    // Collect all R2 keys to delete
    const r2Keys = new Set<string>();
    if (resource.fileKey) r2Keys.add(resource.fileKey);
    if (resource.r2Key) r2Keys.add(resource.r2Key);
    if (resource.thumbnailKey) r2Keys.add(resource.thumbnailKey);
    if (resource.originalFileKey) r2Keys.add(resource.originalFileKey);

    // Also collect from linked TeacherFile (r2PdfKey, r2Key, fileKey)
    const linkedFile = await d1First(
      'SELECT id, fileKey, r2Key, r2PdfKey FROM TeacherFile WHERE resourceId = ?',
      id,
    );
    if (linkedFile) {
      if (linkedFile.fileKey) r2Keys.add(linkedFile.fileKey);
      if (linkedFile.r2Key) r2Keys.add(linkedFile.r2Key);
      if (linkedFile.r2PdfKey) r2Keys.add(linkedFile.r2PdfKey);
    }

    // Audit: counts before deletion
    const counts: Record<string, number> = {};
    const beforeTables = [
      'ResourceContent', 'ResourceMetadata', 'ResourceSummary',
      'View', 'Download', 'Comment', 'Rating', 'Favorite', 'Share', 'Report',
      'Notification',
    ];
    for (const table of beforeTables) {
      const r = await d1First(`SELECT COUNT(*) as n FROM ${table} WHERE resourceId = ?`, id);
      counts[table] = Number(r?.n || 0);
    }
    if (linkedFile) {
      counts['TeacherFile'] = 1;
    }

    // Now delete in order (children first to avoid FK errors)
    const deletions: Record<string, number> = {};
    for (const table of beforeTables) {
      const r = await d1Run(`DELETE FROM ${table} WHERE resourceId = ?`, id);
      deletions[table] = (r as any)?.meta?.changes ?? 0;
    }
    // Delete the TeacherFile
    if (linkedFile) {
      const r = await d1Run('DELETE FROM TeacherFile WHERE id = ?', linkedFile.id);
      deletions['TeacherFile'] = (r as any)?.meta?.changes ?? 0;
    }
    // Finally delete the resource itself
    const r = await d1Run('DELETE FROM Resource WHERE id = ?', id);
    deletions['Resource'] = (r as any)?.meta?.changes ?? 0;

    // Delete R2 objects (best-effort, don't fail if some are missing)
    const r2Results: { key: string; deleted: boolean; error?: string }[] = [];
    const bucket = await getBucket();
    if (bucket) {
      for (const key of r2Keys) {
        try {
          await bucket.delete(key);
          r2Results.push({ key, deleted: true });
        } catch (e: any) {
          r2Results.push({ key, deleted: false, error: e?.message || 'unknown' });
        }
      }
    }

    // Invalidate caches
    try {
      await invalidateCache(`resource-detail-v1-${resource.numericId}`);
    } catch {}
    try {
      await invalidateCache('analytics-topresources-v1');
      await invalidateCache('analytics-topteachers-v1');
    } catch {}
    try {
      revalidatePath(`/fr/ressources/${resource.numericId}/${resource.slug}`);
      revalidatePath(`/ressources/${resource.numericId}/${resource.slug}`);
      revalidatePath('/');
      revalidatePath('/ressources');
      revalidatePath('/admin/ressources');
      revalidatePath('/admin/analytics');
    } catch {}

    console.log(
      `[HARD-DELETE] Admin ${me.email} deleted resource ${id} (numericId=${resource.numericId}, title="${resource.title}"). ` +
        `Tables: ${JSON.stringify(deletions)}. R2: ${r2Results.filter((r) => r.deleted).length}/${r2Results.length} deleted.`,
    );

    return NextResponse.json({
      success: true,
      message: 'Ressource supprimée définitivement',
      resource: {
        id,
        numericId: resource.numericId,
        title: resource.title,
      },
      deletions,
      r2: {
        attempted: r2Keys.size,
        deleted: r2Results.filter((r) => r.deleted).length,
        results: r2Results,
      },
    });
  } catch (e: any) {
    console.error('Hard delete resource error:', e);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

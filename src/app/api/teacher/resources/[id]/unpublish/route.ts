// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/teacher/resources/[id]/unpublish
 *
 * 2026-09-05: Added — teachers couldn't unpublish their own PUBLISHED
 * resources. This meant they couldn't clean up their library or fix
 * mistakes. Now teachers can set status PUBLISHED → DRAFT themselves.
 *
 * Side effects:
 * - Resource.status = 'DRAFT'
 * - Resource.isHidden = 1 (no longer visible on the public site)
 * - Resource.downloadsCount stays (history preserved)
 * - Resource.viewsCount stays
 * - Library TeacherFile is unlinked (resourceId = NULL) — same as DELETE
 *   behavior so the prof can delete the file from their library without
 *   re-publishing it accidentally.
 *
 * Cascade effects (in /enseignant/ressources):
 * - Resource disappears from the public resources list
 * - Old /fr/ressources/[numericId]/[slug] returns 404 (cached too — invalidation
 *   happens via revalidatePath below)
 *
 * Notifications:
 * - Admin gets a `resource_unpublished_by_teacher` notification (in-app + email)
 *   so the admin knows the resource is no longer live.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';
import { notifyAdminsResourceUnpublished } from '@/lib/admin-notify';
import { invalidateCache } from '@/lib/kv-cache';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (isValidOrigin && !isValidOrigin(_req)) {
      return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
    }

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });
    }

    const { id } = await params;
    const resource = await d1First(
      'SELECT id, teacherId, status, title, numericId, slug, downloadsCount, viewsCount FROM Resource WHERE id = ?',
      id,
    );
    if (!resource) return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
    if (user.role !== 'ADMIN' && resource.teacherId !== user.id) {
      return NextResponse.json({ error: 'Vous n\'êtes pas le propriétaire' }, { status: 403 });
    }

    if (resource.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: `Seule une ressource publiée peut être dépubliée (statut actuel: ${resource.status})` },
        { status: 400 },
      );
    }

    const now = Date.now();
    // Set status to DRAFT + isHidden to 1 so the resource is no longer visible
    // on the public site. isHidden=1 is the same flag the admin uses to hide
    // a resource, so the existing public query (status='PUBLISHED' AND isHidden=0)
    // won't return it.
    const r = await d1Run(
      "UPDATE Resource SET status = 'DRAFT', isHidden = 1, updatedAt = ? WHERE id = ?",
      now,
      id,
    );
    if (!(r as any).success) {
      return NextResponse.json({ error: (r as any).error || 'Update failed' }, { status: 500 });
    }

    // Unlink library file (so teacher can delete it without affecting draft)
    await d1Run('UPDATE TeacherFile SET resourceId = NULL, updatedAt = ? WHERE resourceId = ?', now, id);

    // Invalidate KV cache + revalidate pages
    // 2026-09-05: Also invalidate the resource-detail KV cache, otherwise
    // the public page would still serve the cached PUBLISHED response for
    // up to 60s after unpublish.
    try {
      await invalidateCache(`resource-detail-v1-${resource.numericId}`);
    } catch (e) {
      // Best effort
    }
    try {
      revalidatePath(`/fr/ressources/${resource.numericId}/${resource.slug}`);
      revalidatePath(`/ressources/${resource.numericId}/${resource.slug}`);
      revalidatePath('/enseignant/ressources');
      revalidatePath('/');
      revalidatePath('/ressources');
    } catch (e) {
      // Best effort
    }

    // Notify admins (in-app + email) — fire-and-forget but awaited
    // (CF Workers loses context on fire-and-forget)
    try {
      await notifyAdminsResourceUnpublished(
        id,
        user.firstName || user.lastName || 'Un enseignant',
        resource.title,
      );
    } catch (e) {
      console.error('Unpublish admin notify error:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Ressource dépubliée. Le fichier de votre bibliothèque peut maintenant être supprimé.',
    });
  } catch (e: any) {
    console.error('Unpublish resource error:', e);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

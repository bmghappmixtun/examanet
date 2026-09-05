// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run, getD1 } from '@/lib/db-d1';
import { sendEditApprovedEmail, sendEditRejectedEmail } from '@/lib/email';

export const runtime = 'nodejs';

/**
 * POST /api/admin/resource/[id]/edit
 * Approve or reject a pending edit on a PUBLISHED resource.
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * 2026-09-05: Rewrote to use raw D1 SQL — d1-admin.update was failing silently
 * on `Prisma.JsonNull`, `null` values for `editStatus`/`editRejectionReason`,
 * and missing columns (editRejectionReason, approvedById, approvedAt).
 *
 * - Approve: applies the pendingEdit JSON to the resource, clears edit
 *   state, sends approval email + in-app notification to the teacher.
 *   If the original resource was REJECTED/DRAFT/PENDING_APPROVAL (rare for
 *   a PUBLISHED resource, but possible if a teacher re-submits after
 *   rejection), we ALSO flip the status to PUBLISHED.
 * - Reject: clears pendingEdit, sets editStatus='EDIT_REJECTED', saves
 *   reason, sends rejection email + in-app notification.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const action = body.action;
    const reason: string | undefined = body.reason;

    // 1. Fetch the resource (raw SQL — no Prisma needed)
    const resource = await d1First(
      `SELECT id, slug, numericId, title, status, editStatus, pendingEdit,
              teacherId, publishedAt
       FROM Resource WHERE id = ?`,
      id,
    );
    if (!resource) {
      return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
    }
    if (resource.editStatus !== 'PENDING_EDIT_APPROVAL') {
      return NextResponse.json(
        { error: 'Aucune modification en attente' },
        { status: 400 },
      );
    }

    // Fetch teacher profile (for the email and the notifications)
    let teacher: any = null;
    if (resource.teacherId) {
      teacher = await d1First(
        'SELECT id, email, firstName, lastName FROM "User" WHERE id = ?',
        resource.teacherId,
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
    const finalUrl = `${siteUrl}/fr/ressources/${resource.numericId}/${resource.slug}`;
    const now = Date.now();

    if (action === 'approve') {
      // Parse pendingEdit (it's a TEXT column with JSON)
      let pending: any = {};
      try {
        pending = resource.pendingEdit
          ? typeof resource.pendingEdit === 'string'
            ? JSON.parse(resource.pendingEdit)
            : resource.pendingEdit
          : {};
      } catch {
        pending = {};
      }

      // Decide if we need to publish (only if the original was never published)
      const mustPublish =
        resource.status === 'REJECTED' ||
        resource.status === 'DRAFT' ||
        resource.status === 'PENDING_APPROVAL';

      // Build UPDATE: apply pending file/metadata + clear edit state
      // pendingEdit typically contains { fileKey, fileUrl, fileSize }
      // (and possibly other metadata fields if the teacher used the metadata edit form)
      const setClauses: string[] = [];
      const values: any[] = [];

      // Apply each pending field
      if (pending.fileKey) { setClauses.push('fileKey = ?'); values.push(pending.fileKey); }
      if (pending.fileUrl) { setClauses.push('fileUrl = ?'); values.push(pending.fileUrl); }
      if (pending.fileSize) { setClauses.push('fileSize = ?'); values.push(pending.fileSize); }
      if (pending.pageCount) { setClauses.push('pageCount = ?'); values.push(pending.pageCount); }
      // Future: other pendingEdit fields (title/description/etc.)
      // For now the metadata edit flow uses /api/teacher/resources/[id] PATCH
      // (which updates directly for REJECTED resources, no edit approval needed)

      // Clear edit state
      setClauses.push('pendingEdit = ?'); values.push(null);
      setClauses.push('editStatus = ?'); values.push(null);
      setClauses.push('editRejectionReason = ?'); values.push(null);
      setClauses.push('editRequestedAt = ?'); values.push(null);
      setClauses.push('editRequestedById = ?'); values.push(null);
      setClauses.push('editReviewedAt = ?'); values.push(now);
      setClauses.push('editReviewedById = ?'); values.push(user.id);

      // If we need to publish (REJECTED → PUBLISHED transition)
      if (mustPublish) {
        setClauses.push('status = ?'); values.push('PUBLISHED');
        setClauses.push('rejectionReason = ?'); values.push(null);
        setClauses.push('rejectionAt = ?'); values.push(null);
        setClauses.push('approvedAt = ?'); values.push(now);
        setClauses.push('approvedById = ?'); values.push(user.id);
        if (!resource.publishedAt) {
          setClauses.push('publishedAt = ?'); values.push(now);
        }
      }

      // Always bump updatedAt
      setClauses.push('updatedAt = ?'); values.push(now);

      // Run the UPDATE
      const updateRes = await d1Run(
        `UPDATE Resource SET ${setClauses.join(', ')} WHERE id = ?`,
        ...values, id,
      );
      if (!updateRes.success) {
        return NextResponse.json({ error: updateRes.error }, { status: 500 });
      }

      // Revalidate relevant paths
      revalidatePath('/fr/ressources');
      revalidatePath(`/fr/ressources/${resource.numericId}/${resource.slug}`);
      revalidatePath('/');
      revalidatePath('/enseignant/bibliotheque');
      revalidatePath('/admin/ressources/editions');
      revalidatePath('/admin/ressources');
      if (teacher) {
        revalidatePath(`/fr/professeurs/${teacher.id}`);
      }

      // Send in-app notification to the teacher
      if (teacher) {
        const notifId = crypto.randomUUID().replace(/-/g, '').slice(0, 25);
        await d1Run(
          `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          notifId,
          teacher.id,
          'edit_approved',
          'Modification approuvée ✅',
          `Votre modification sur « ${resource.title} » a été approuvée et publiée.`,
          `/fr/ressources/${resource.numericId}/${resource.slug}`,
          now,
        );
      }

      // Send approval email
      if (teacher?.email && teacher?.firstName) {
        try {
          await sendEditApprovedEmail(
            teacher.email,
            teacher.firstName,
            resource.title,
            finalUrl,
          );
        } catch (e) {
          console.error('[admin/resource edit approve] email failed:', e?.message);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Modification approuvée et publiée.',
      });
    }

    if (action === 'reject') {
      const finalReason = reason?.trim() || "Modification refusée par l'administrateur.";

      // Clear pendingEdit + set EDIT_REJECTED
      const updateRes = await d1Run(
        `UPDATE Resource
         SET pendingEdit = ?, editStatus = ?, editRejectionReason = ?,
             editRequestedAt = ?, editRequestedById = ?,
             editReviewedAt = ?, editReviewedById = ?, updatedAt = ?
         WHERE id = ?`,
        null, 'EDIT_REJECTED', finalReason,
        null, null,
        now, user.id, now,
        id,
      );
      if (!updateRes.success) {
        return NextResponse.json({ error: updateRes.error }, { status: 500 });
      }

      // Revalidate
      revalidatePath('/admin/ressources/editions');
      revalidatePath('/enseignant/bibliotheque');
      if (teacher) revalidatePath(`/fr/professeurs/${teacher.id}`);

      // In-app notification
      if (teacher) {
        const notifId = crypto.randomUUID().replace(/-/g, '').slice(0, 25);
        await d1Run(
          `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          notifId,
          teacher.id,
          'edit_rejected',
          'Modification refusée ❌',
          `Votre modification sur « ${resource.title} » a été refusée. Motif : ${finalReason.slice(0, 100)}`,
          '/enseignant/bibliotheque',
          now,
        );
      }

      // Email
      if (teacher?.email && teacher?.firstName) {
        try {
          await sendEditRejectedEmail(
            teacher.email,
            teacher.firstName,
            resource.title,
            finalReason,
            finalUrl,
          );
        } catch (e) {
          console.error('[admin/resource edit reject] email failed:', e?.message);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Modification refusée.',
      });
    }

    return NextResponse.json({ error: 'Action invalide (approve|reject)' }, { status: 400 });
  } catch (e: any) {
    console.error('Edit review error:', e);
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 });
  }
}

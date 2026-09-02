// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const { id, action } = await params;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  }
  const resource = await d1First(
    'SELECT id, status, slug, numericId, title, teacherId FROM Resource WHERE id = ?',
    id,
  );
  if (!resource) return NextResponse.json({ error: 'Ressource non trouvée' }, { status: 404 });
  let body: { reason?: string } = {};
  try { body = await req.json(); } catch {}
  if (action === 'approve') {
    const r = await d1Run(
      "UPDATE Resource SET status = 'PUBLISHED', publishedAt = ?, updatedAt = ? WHERE id = ?",
      Date.now(), Date.now(), id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    // Revalidate the resource page
    if (resource.numericId && resource.slug) {
      try { revalidatePath(`/fr/ressources/${resource.numericId}/${resource.slug}`); } catch {}
    }
    // Notify the teacher (fire-and-forget) — in-app + email
    if (resource.teacherId) {
      // Pre-fetch DB so the function has a working context, and AWAIT the call
      // (fire-and-forget in CF Workers loses context — the function never runs)
      const db = await getD1();
      try {
        await notifyResourceStatusChange({
          db,
          teacherId: resource.teacherId,
          resourceId: resource.id,
          resourceTitle: resource.title,
          numericId: resource.numericId,
          slug: resource.slug,
          approved: true,
          reason: body.reason,
        });
      } catch (e) {
        console.error('[admin/resource action] notify teacher (approve) failed:', e?.message, e?.stack);
      }
    }
    return NextResponse.json({ success: true, status: 'PUBLISHED' });
  } else {
    const rejectReason = (body.reason || '').trim() || 'Aucun motif fourni';
    const rejectedAt = Date.now();
    const r = await d1Run(
      "UPDATE Resource SET status = 'REJECTED', rejectionReason = ?, rejectionAt = ?, updatedAt = ? WHERE id = ?",
      rejectReason,
      rejectedAt,
      rejectedAt,
      id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    if (resource.teacherId) {
      // Pre-fetch DB so the function has a working context, and AWAIT the call
      // (fire-and-forget in CF Workers loses context — the function never runs)
      const db = await getD1();
      try {
        await notifyResourceStatusChange({
          db,
          teacherId: resource.teacherId,
          resourceId: resource.id,
          resourceTitle: resource.title,
          numericId: resource.numericId,
          slug: resource.slug,
          approved: false,
          reason: rejectReason,
        });
      } catch (e) {
        console.error('[admin/resource action] notify teacher (reject) failed:', e?.message, e?.stack);
      }
    }
    return NextResponse.json({ success: true, status: 'REJECTED' });
  }
}

/**
 * Notify the teacher when their resource is approved or rejected.
 * Sends both an in-app Notification (D1) and an email (Resend).
 *
 * IMPORTANT: Must be AWAITED by the caller. Fire-and-forget in CF Workers
 * loses context — the function never runs.
 * The `db` argument must be pre-fetched in the request handler.
 */
async function notifyResourceStatusChange(opts: {
  db: any;  // Pre-fetched D1 binding
  teacherId: string;
  resourceId: string;
  resourceTitle: string;
  numericId: number | null;
  slug: string | null;
  approved: boolean;
  reason?: string;
}) {
  const { db } = opts;

  // Get teacher using the pre-fetched db (avoids getD1 context loss)
  const teacher = await db
    .prepare('SELECT id, email, firstName, lastName FROM User WHERE id = ?')
    .bind(opts.teacherId)
    .first();
  if (!teacher || !teacher.email) return;

  const firstName = teacher.firstName || 'Enseignant';
  const title = opts.resourceTitle || 'votre ressource';
  const resourceUrl =
    opts.numericId && opts.slug
      ? `${process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com'}/fr/ressources/${opts.numericId}/${opts.slug}`
      : undefined;

  // 1) In-app notification
  const notifId = crypto.randomUUID().replace(/-/g, '').slice(0, 25);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO Notification (id, userId, type, title, body, link, isRead, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(
      notifId,
      teacher.id,
      opts.approved ? 'resource_approved' : 'resource_rejected',
      opts.approved ? '✓ Ressource approuvée' : '❌ Ressource refusée',
      opts.approved
        ? `Votre ressource « ${title} » a été approuvée et est maintenant en ligne.`
        : `Votre ressource « ${title} » a été refusée${opts.reason ? ` : ${opts.reason}` : ''}.`,
      resourceUrl ? `/fr/ressources/${opts.numericId}/${opts.slug}` : '/enseignant/bibliotheque',
      now,
    )
    .run();

  // 2) Email (use a dedicated template for rejections so the motif is rendered
  //    prominently and the prof can act on it)
  if (opts.approved) {
    const { sendResourceApprovedEmail } = await import('@/lib/email');
    await sendResourceApprovedEmail(teacher.email, firstName, title, true, resourceUrl);
  } else {
    const { sendResourceRejectedEmail } = await import('@/lib/email');
    await sendResourceRejectedEmail(
      teacher.email,
      firstName,
      title,
      opts.reason || 'Aucun motif fourni',
      resourceUrl,
    );
  }
}

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
      notifyResourceStatusChange({
        teacherId: resource.teacherId,
        resourceId: resource.id,
        resourceTitle: resource.title,
        numericId: resource.numericId,
        slug: resource.slug,
        approved: true,
        reason: body.reason,
      }).catch((e) => console.error('[admin/resource action] notify teacher failed:', e));
    }
    return NextResponse.json({ success: true, status: 'PUBLISHED' });
  } else {
    const r = await d1Run(
      "UPDATE Resource SET status = 'REJECTED', updatedAt = ? WHERE id = ?",
      Date.now(), id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    if (resource.teacherId) {
      notifyResourceStatusChange({
        teacherId: resource.teacherId,
        resourceId: resource.id,
        resourceTitle: resource.title,
        numericId: resource.numericId,
        slug: resource.slug,
        approved: false,
        reason: body.reason,
      }).catch((e) => console.error('[admin/resource action] notify teacher failed:', e));
    }
    return NextResponse.json({ success: true, status: 'REJECTED' });
  }
}

/**
 * Notify the teacher when their resource is approved or rejected.
 * Sends both an in-app Notification (D1) and an email (Resend).
 */
async function notifyResourceStatusChange(opts: {
  teacherId: string;
  resourceId: string;
  resourceTitle: string;
  numericId: number | null;
  slug: string | null;
  approved: boolean;
  reason?: string;
}) {
  const db = await getD1();
  const teacher = await d1First(
    'SELECT id, email, firstName, lastName FROM User WHERE id = ?',
    opts.teacherId,
  );
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

  // 2) Email
  try {
    const { sendResourceApprovedEmail } = await import('@/lib/email');
    await sendResourceApprovedEmail(
      teacher.email,
      firstName,
      title,
      opts.approved,
      resourceUrl,
    );
  } catch (e) {
    console.error('[notifyResourceStatusChange] email send failed:', e);
  }
}

// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

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
    'SELECT id, status, slug, numericId, title FROM Resource WHERE id = ?',
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
    return NextResponse.json({ success: true, status: 'PUBLISHED' });
  } else {
    const r = await d1Run(
      "UPDATE Resource SET status = 'REJECTED', updatedAt = ? WHERE id = ?",
      Date.now(), id,
    );
    if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ success: true, status: 'REJECTED' });
  }
}

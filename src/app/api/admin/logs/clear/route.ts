// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { d1First, d1All, d1Run } from '@/lib/db-d1';
import { getCurrentUser } from '@/lib/auth';
import { isValidOrigin, isProduction } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * DELETE /api/admin/logs/clear
 *
 * Delete all CloudflareLog + ErrorLog entries.
 * Optional body: { source: 'cloudflare' | 'errorlog' | 'all' (default), olderThanDays: N }
 *
 * Use cases:
 * - Reset monitoring after a deploy
 * - Clean up noise from a known issue
 * - Free up space in the CloudflareLog/ErrorLog tables
 *
 * 2026-09-06: Rewritten to use raw D1 (d1All/d1Run/d1First) instead of the
 * d1-admin stub which was causing 'no such table: vercelLog' errors.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Non autorisé', status: 401 };
  if (user.role !== 'ADMIN') return { error: 'Accès admin requis', status: 403 };
  return { user };
}

export async function DELETE(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json().catch(() => ({}));
    const source = body.source || 'all';
    const olderThanDays = body.olderThanDays ?? null;

    let cloudflareDeleted = 0;
    let errorLogDeleted = 0;
    const cutoff = olderThanDays != null
      ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
      : null;

    if (source === 'all' || source === 'cloudflare' || source === 'vercel') {
      // Note: 'vercel' is kept as a backward-compat alias
      const table = 'CloudflareLog';
      if (cutoff) {
        const r: any = await d1Run(`DELETE FROM ${table} WHERE createdAt < ?`, cutoff);
        cloudflareDeleted = r?.meta?.changes ?? 0;
      } else {
        const r: any = await d1Run(`DELETE FROM ${table}`);
        cloudflareDeleted = r?.meta?.changes ?? 0;
      }
    }

    if (source === 'all' || source === 'errorlog') {
      if (cutoff) {
        const r: any = await d1Run('DELETE FROM ErrorLog WHERE createdAt < ?', cutoff);
        errorLogDeleted = r?.meta?.changes ?? 0;
      } else {
        const r: any = await d1Run('DELETE FROM ErrorLog');
        errorLogDeleted = r?.meta?.changes ?? 0;
      }
    }

    return NextResponse.json({
      ok: true,
      deleted: { cloudflare: cloudflareDeleted, errorlog: errorLogDeleted },
      source,
      olderThanDays,
    });
  } catch (e) {
    return NextResponse.json({
      error: 'Delete failed',
      detail: (e as Error).message,
    }, { status: 500 });
  }
}

/**
 * GET /api/admin/logs/clear (preview)
 * Returns counts of what would be deleted.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const source = url.searchParams.get('source') || 'all';
  const olderThanDays = url.searchParams.get('olderThanDays');
  const cutoff = olderThanDays
    ? Date.now() - Number(olderThanDays) * 24 * 60 * 60 * 1000
    : null;

  let cloudflareCount = 0;
  let errorLogCount = 0;

  if (source === 'all' || source === 'cloudflare' || source === 'vercel') {
    const row: any = cutoff
      ? await d1First('SELECT COUNT(*) as c FROM CloudflareLog WHERE createdAt < ?', cutoff)
      : await d1First('SELECT COUNT(*) as c FROM CloudflareLog');
    cloudflareCount = Number(row?.c ?? 0);
  }
  if (source === 'all' || source === 'errorlog') {
    const row: any = cutoff
      ? await d1First('SELECT COUNT(*) as c FROM ErrorLog WHERE createdAt < ?', cutoff)
      : await d1First('SELECT COUNT(*) as c FROM ErrorLog');
    errorLogCount = Number(row?.c ?? 0);
  }

  return NextResponse.json({
    wouldDelete: { cloudflare: cloudflareCount, errorlog: errorLogCount },
    source,
    olderThanDays: olderThanDays ? Number(olderThanDays) : null,
  });
}

// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/blob-cleanup
 * Delete files from R2 storage (Vercel Blob → R2 migration 2026-09-07).
 * Body: { urls: string[] } or { keys: string[] }
 *
 * Auth: ADMIN role OR SEED_TOKEN (consistent with other admin endpoints)
 * Returns: { success, requested, deleted, failed, errors }
 */
import { NextRequest, NextResponse } from 'next/server';
import { deleteFile } from '@/lib/storage';
import { db } from '@/lib/d1-admin';
import { getCurrentUser } from '@/lib/auth';

export const maxDuration = 120;
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const seedToken = req.headers.get('x-seed-token') || req.nextUrl.searchParams.get('token');

    let isAdmin = user?.role === 'ADMIN';
    if (!isAdmin && seedToken === process.env.SEED_TOKEN) {
      const admin = await db.user.findFirst({ where: { role: 'ADMIN' } });
      if (admin) isAdmin = true;
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin requis' }, { status: 403 });
    }

    const body = await req.json();
    const urls = Array.isArray(body.urls) ? body.urls : [];
    const keys = Array.isArray(body.keys) ? body.keys : [];

    if (urls.length === 0 && keys.length === 0) {
      return NextResponse.json({ error: 'urls or keys requis' }, { status: 400 });
    }

    let deleted = 0,
      failed = 0;
    const errors: string[] = [];

    for (const item of [...urls, ...keys]) {
      try {
        // 2026-09-07: R2 migration — use deleteFile (was del() from Vercel Blob)
        // Accepts both R2 keys and our proxy URLs (/api/file/KEY)
        await deleteFile(item);
        deleted++;
      } catch (e: any) {
        failed++;
        errors.push(`${item.toString().slice(-40)}: ${e.message?.slice(0, 60) || 'unknown'}`);
      }
    }

    return NextResponse.json({
      success: true,
      requested: urls.length + keys.length,
      deleted,
      failed,
      errors: errors.slice(0, 5),
    });
  } catch (e: any) {
    console.error('[blob-cleanup]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

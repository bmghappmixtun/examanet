// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/blob-cleanup
 * Delete blob URLs from Vercel Blob storage.
 * Body: { urls: string[] }
 *
 * Auth: ADMIN role OR SEED_TOKEN (consistent with other admin endpoints)
 * Returns: { success, requested, deleted, failed, errors }
 */
import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const maxDuration = 120;
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const seedToken = req.headers.get('x-seed-token') || req.nextUrl.searchParams.get('token');

    let isAdmin = user?.role === 'ADMIN';
    if (!isAdmin && seedToken === process.env.SEED_TOKEN) {
      const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (admin) isAdmin = true;
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin requis' }, { status: 403 });
    }

    const body = await req.json();
    const urls = Array.isArray(body.urls) ? body.urls : [];

    if (urls.length === 0) {
      return NextResponse.json({ error: 'urls requis' }, { status: 400 });
    }

    let deleted = 0,
      failed = 0;
    const errors: string[] = [];

    for (const url of urls) {
      try {
        await del(url);
        deleted++;
      } catch (e: any) {
        failed++;
        errors.push(`${url.slice(-40)}: ${e.message?.slice(0, 60) || 'unknown'}`);
      }
    }

    return NextResponse.json({
      success: true,
      requested: urls.length,
      deleted,
      failed,
      errors: errors.slice(0, 5),
    });
  } catch (e: any) {
    console.error('[blob-cleanup]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * DELETE /api/admin/logs/clear
 *
 * Delete all VercelLog + ErrorLog entries.
 * Optional body: { source: 'vercel' | 'errorlog' | 'all' (default), olderThanDays: N }
 *
 * Use cases:
 * - Reset monitoring after a deploy
 * - Clean up noise from a known issue
 * - Free up space in the VercelLog/ErrorLog tables
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const source = body.source || 'all';
    const olderThanDays = body.olderThanDays ?? null;

    let vercelDeleted = 0;
    let errorLogDeleted = 0;
    const cutoff = olderThanDays != null
      ? new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
      : null;

    if (source === 'all' || source === 'vercel') {
      if (cutoff) {
        const r = await prisma.$executeRaw`
          DELETE FROM "VercelLog" WHERE timestamp < ${cutoff}
        `;
        vercelDeleted = Number(r);
      } else {
        const r = await prisma.$executeRaw`DELETE FROM "VercelLog"`;
        vercelDeleted = Number(r);
      }
    }

    if (source === 'all' || source === 'errorlog') {
      if (cutoff) {
        const r = await prisma.errorLog.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });
        errorLogDeleted = r.count;
      } else {
        const r = await prisma.errorLog.deleteMany({});
        errorLogDeleted = r.count;
      }
    }

    return NextResponse.json({
      ok: true,
      deleted: { vercel: vercelDeleted, errorlog: errorLogDeleted },
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
  const url = new URL(req.url);
  const source = url.searchParams.get('source') || 'all';
  const olderThanDays = url.searchParams.get('olderThanDays');
  const cutoff = olderThanDays
    ? new Date(Date.now() - Number(olderThanDays) * 24 * 60 * 60 * 1000)
    : null;

  let vercelCount = 0;
  let errorLogCount = 0;

  if (source === 'all' || source === 'vercel') {
    if (cutoff) {
      vercelCount = await prisma.vercelLog.count({ where: { timestamp: { lt: cutoff } } });
    } else {
      vercelCount = await prisma.vercelLog.count();
    }
  }
  if (source === 'all' || source === 'errorlog') {
    if (cutoff) {
      errorLogCount = await prisma.errorLog.count({ where: { createdAt: { lt: cutoff } } });
    } else {
      errorLogCount = await prisma.errorLog.count();
    }
  }

  return NextResponse.json({
    wouldDelete: { vercel: vercelCount, errorlog: errorLogCount },
    source,
    olderThanDays: olderThanDays ? Number(olderThanDays) : null,
  });
}

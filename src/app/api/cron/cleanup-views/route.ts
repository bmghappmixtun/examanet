// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Vercel Cron endpoint — runs nightly to delete old View records.
 *
 * Schedule (vercel.json):
 *   { "crons": [{ "path": "/api/cron/cleanup-views", "schedule": "0 3 * * *" }] }
 *
 * Auth: requires CRON_SECRET in the Authorization header (Vercel sets this automatically).
 */
export async function GET(req: NextRequest) {
  // Verify Vercel Cron auth
  const authHeader = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  // Count
  const count = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*) as c FROM "View" WHERE "createdAt" < NOW() - INTERVAL '90 days'
  `;
  const toDelete = Number(count[0]?.c ?? 0);

  if (toDelete === 0) {
    return NextResponse.json({
      ok: true,
      deleted: 0,
      message: 'No old views to clean up',
      duration: Date.now() - start,
    });
  }

  // Delete
  const result = await prisma.$executeRaw`
    DELETE FROM "View" WHERE "createdAt" < NOW() - INTERVAL '90 days'
  `;

  return NextResponse.json({
    ok: true,
    deleted: Number(result),
    duration: Date.now() - start,
  });
}

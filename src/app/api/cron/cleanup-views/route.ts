// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { d1All, d1Run } from '@/lib/db-d1';
import { requireCronSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * CF Cron endpoint — runs nightly to delete old View records.
 *
 * Auth: requires CRON_SECRET (read from CF env or process.env).
 *
 * 2026-09-05: Migrated from Vercel Cron to CF Cron triggers (wrangler.prod.jsonc).
 * 2026-09-05: Replaced Prisma $queryRaw/$executeRaw with raw D1 SQL (Prisma
 * raw queries were broken via d1-admin proxy).
 */
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // Auth (CF env → process.env → devDefault)
  const authErr = await requireCronSecret(req);
  if (authErr) return authErr;

  const start = Date.now();
  const cutoff = start - NINETY_DAYS_MS;

  // Count
  const count = await d1All(
    `SELECT COUNT(*) AS c FROM "View" WHERE createdAt < ?`,
    cutoff,
  );
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
  const result = await d1Run(
    `DELETE FROM "View" WHERE createdAt < ?`,
    cutoff,
  );

  return NextResponse.json({
    ok: true,
    deleted: result?.meta?.changes ?? 0,
    duration: Date.now() - start,
  });
}

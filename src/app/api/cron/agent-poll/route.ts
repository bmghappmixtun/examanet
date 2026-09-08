// @ts-nocheck
/**
 * Agent poll endpoint
 * Called by Vercel Cron to aggregate unseen errors and prepare a digest
 * for the next Mavis session.

The endpoint:
1. Reads un-seen CRITICAL/ERROR errors from the last 24h
2. Marks them as "seen by agent" (so we don't spam)
3. Returns a summary digest

The agent (Mavis) can then read this digest via:
- Direct call to this endpoint (manually)
- A scheduled check at session start
- After errors, the user can ask "any new errors?" and we check here

Note: This doesn't actually notify Mavis in real-time (it has no email)
But it provides a digest endpoint that the next session can poll
 */

import { NextRequest, NextResponse } from 'next/server';
import { d1All, d1Run } from '@/lib/db-d1';
import { requireCronSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // 2026-09-05: use cf-auth helper for cross-env secret
  const authErr = await requireCronSecret(req, { devDefault: 'agent-poll-secret' });
  if (authErr) return authErr;

  try {
    // 2026-09-05: Replaced Prisma findMany/updateMany with raw D1 SQL
    // (Prisma proxy was broken via d1-admin).
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    // Find un-seen CRITICAL/ERROR errors from last 24h
    const rows: any[] = await d1All(
      `SELECT id, level as severity, source, message, url, createdAt, userEmail
       FROM ErrorLog
       WHERE agentSeen = 0
         AND level IN ('ERROR', 'CRITICAL')
         AND createdAt >= ?
       ORDER BY createdAt DESC
       LIMIT 50`,
      cutoff,
    );

    // Mark them as seen
    if (rows.length > 0) {
      const ids = rows.map((e) => e.id);
      // Build IN clause with proper binding
      const placeholders = ids.map(() => '?').join(',');
      await d1Run(
        `UPDATE ErrorLog SET agentSeen = 1, updatedAt = ? WHERE id IN (${placeholders})`,
        Date.now(),
        ...ids,
      );
    }

    // Group by severity + source
    const summary = {
      totalCount: rows.length,
      bySeverity: rows.reduce<Record<string, number>>((acc, e) => {
        acc[e.severity] = (acc[e.severity] || 0) + 1;
        return acc;
      }, {}),
      bySource: rows.reduce<Record<string, number>>((acc, e) => {
        acc[e.source] = (acc[e.source] || 0) + 1;
        return acc;
      }, {}),
      topErrors: rows.slice(0, 5).map((e) => ({
        reference: e.id, // ErrorLog uses `id` not `reference`
        severity: e.severity,
        source: e.source,
        message: (e.message || '').slice(0, 200),
        url: e.url,
        time: new Date(e.createdAt).toISOString(),
        userEmail: e.userEmail,
      })),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      ok: true,
      digest: summary,
      note: rows.length > 0
        ? `⚠️ ${rows.length} new error(s) since last check. Marked as seen.`
        : '✅ No new errors since last check.',
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

// GET (no auth) for Mavis to poll from any session
export async function POST(req: NextRequest) {
  return GET(req);
}

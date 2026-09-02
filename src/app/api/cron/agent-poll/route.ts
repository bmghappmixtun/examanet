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

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const AGENT_SECRET = process.env.CRON_SECRET || 'agent-poll-secret';

export async function GET(req: Request) {
  // Auth check
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${AGENT_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    // Find un-seen CRITICAL/ERROR errors from last 24h
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const unseenErrors = await prisma.errorLog.findMany({
      where: {
        agentSeen: false,
        severity: { in: ['ERROR', 'CRITICAL'] },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Mark them as seen
    if (unseenErrors.length > 0) {
      const ids = unseenErrors.map((e) => e.id);
      await prisma.errorLog.updateMany({
        where: { id: { in: ids } },
        data: { agentSeen: true, agentSeenAt: new Date() },
      });
    }

    // Group by severity + source
    const summary = {
      totalCount: unseenErrors.length,
      bySeverity: unseenErrors.reduce<Record<string, number>>((acc, e) => {
        acc[e.severity] = (acc[e.severity] || 0) + 1;
        return acc;
      }, {}),
      bySource: unseenErrors.reduce<Record<string, number>>((acc, e) => {
        acc[e.source] = (acc[e.source] || 0) + 1;
        return acc;
      }, {}),
      topErrors: unseenErrors.slice(0, 5).map((e) => ({
        reference: e.reference,
        severity: e.severity,
        source: e.source,
        message: e.message.slice(0, 200),
        url: e.url,
        time: e.createdAt.toISOString(),
        userEmail: e.userEmail,
      })),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      ok: true,
      digest: summary,
      note: unseenErrors.length > 0
        ? `⚠️ ${unseenErrors.length} new error(s) since last check. Marked as seen.`
        : '✅ No new errors since last check.',
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

// GET (no auth) for Mavis to poll from any session
export async function POST(req: Request) {
  return GET(req);
}

// @ts-nocheck
/**
 * Mavis reads the latest nightly error digest
 * Public GET (no auth) — Mavis can call this at session start
 *
 * Returns the summary of the most recent nightly cleanup run
 * so Mavis knows what errors to investigate and fix.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Reconstruct the digest from the DB by querying recently-seen errors
  // (the nightly-cleanup marked them as seen)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get the timestamp of the last batch of seen-together errors
  const recent = await prisma.errorLog.findMany({
    where: {
      agentSeen: true,
      agentSeenAt: { gte: since },
    },
    orderBy: { agentSeenAt: 'desc' },
    take: 200,
  });

  if (recent.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No recent nightly cleanup ran, or no errors were found.',
      count: 0,
      grouped: [],
    });
  }

  // Group by message hash
  const grouped = new Map<string, { count: number; sample: typeof recent[number]; severities: Set<string> }>();
  for (const e of recent) {
    let h = 0;
    for (let i = 0; i < e.message.length; i++) {
      h = ((h << 5) - h + e.message.charCodeAt(i)) | 0;
    }
    const key = Math.abs(h).toString(36);
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
      existing.severities.add(e.severity);
    } else {
      grouped.set(key, { count: 1, sample: e, severities: new Set([e.severity]) });
    }
  }

  const sorted = Array.from(grouped.values()).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    lastRunAt: recent[0].agentSeenAt,
    count: recent.length,
    grouped: sorted.slice(0, 20).map((g) => ({
      count: g.count,
      severities: Array.from(g.severities),
      reference: g.sample.reference,
      message: g.sample.message,
      url: g.sample.url,
      source: g.sample.source,
      createdAt: g.sample.createdAt,
      context: g.sample.context,
    })),
  });
}

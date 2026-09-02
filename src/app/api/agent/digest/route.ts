// @ts-nocheck
/**
 * Public agent digest endpoint
 * Returns a summary of recent errors for Mavis to read at session start
 * No auth (just a GET) — meant to be called by the agent

Mavis can call this at the start of any session to see if there are
unhandled errors that need attention.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.errorLog.findMany({
      where: { createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      total: recent.length,
      critical: recent.filter((e) => e.severity === 'CRITICAL').length,
      error: recent.filter((e) => e.severity === 'ERROR').length,
      warning: recent.filter((e) => e.severity === 'WARNING').length,
      recent: recent.slice(0, 10).map((e) => ({
        ref: e.reference,
        severity: e.severity,
        source: e.source,
        msg: e.message.slice(0, 120),
        time: e.createdAt.toISOString(),
      })),
      nextSteps: recent.length > 0
        ? 'Check /admin/erreurs on Examanet for full details. View error.stack for debugging.'
        : 'All clear — no recent errors.',
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

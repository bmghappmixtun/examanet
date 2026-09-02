// @ts-nocheck
/**
 * Mavis nightly fix report
 * POSTs the agent's fix summary to Discord (using the same webhook as
 * the error logger) and returns the post result.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Body: {
 *   title: string,
 *   summary: string,           // one-line
 *   fixedCount: number,
 *   deferredCount: number,
 *   filesChanged: string[],
 *   commits: string[],         // commit SHAs
 *   details?: string,          // long-form markdown body
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  // Mavis (the agent) can also authenticate with a dedicated token so it
  // can post the nightly fix report from a local env that doesn't have
  // CRON_SECRET. The token is set in Vercel as AGENT_REPORT_TOKEN and
  // can be rotated independently from the cron secret.
  const expectedAgent = process.env.AGENT_REPORT_TOKEN
    ? `Bearer ${process.env.AGENT_REPORT_TOKEN}`
    : null;
  if (!auth || (auth !== expected && (!expectedAgent || auth !== expectedAgent))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const {
    title = '🌙 Nightly cleanup report',
    summary = '',
    fixedCount = 0,
    deferredCount = 0,
    filesChanged = [] as string[],
    commits = [] as string[],
    details = '',
  } = body || {};

  if (!DISCORD_WEBHOOK_URL) {
    return NextResponse.json({ ok: false, error: 'no_webhook' }, { status: 503 });
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Auto-fixed', value: String(fixedCount), inline: true },
    { name: 'Deferred', value: String(deferredCount), inline: true },
    { name: 'Files', value: String(filesChanged.length), inline: true },
  ];
  if (commits.length) {
    fields.push({
      name: 'Commits',
      value: commits.map((c: string) => `\`${c.slice(0, 7)}\``).join(' '),
      inline: false,
    });
  }
  if (filesChanged.length) {
    fields.push({
      name: 'Files changed',
      value: filesChanged.slice(0, 8).map((f: string) => `\`${f}\``).join(' '),
      inline: false,
    });
  }
  if (details) {
    fields.push({
      name: 'Details',
      value: details.slice(0, 1000),
      inline: false,
    });
  }

  const embed = {
    title,
    description: summary,
    color: 0x10b981, // green
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'Examanet nightly fix report' },
  };

  let posted = false;
  let postError: string | null = null;
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🌙 **Nightly fix complete** — ${fixedCount} auto-fixed, ${deferredCount} deferred`,
        embeds: [embed],
        allowed_mentions: { parse: [] },
      }),
    });
    posted = res.ok;
    if (!res.ok) {
      postError = `HTTP ${res.status}: ${await res.text().catch(() => '')}`;
    }
  } catch (e: any) {
    postError = e?.message || String(e);
  }

  return NextResponse.json({ ok: posted, error: postError });
}

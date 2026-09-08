// @ts-nocheck
/**
 * /api/agent/session-start
 *
 * 2026-09-06: NEW endpoint — Mavis (or any external orchestrator) calls this
 * at session start to fetch the digest of unseen platform errors. The
 * endpoint:
 *  1. Reads the last 24h of errors from BOTH ErrorLog (caught by app) and
 *     CloudflareLog (synced from CF Observability by the cf-observability-sync
 *     cron every 5 min)
 *  2. Groups them by message hash so Mavis sees UNIQUE bugs (not 50 copies
 *     of the same error)
 *  3. Marks them as 'seenBySession' so the next session doesn't re-process
 *     them
 *  4. Returns a digest with: totalErrors, uniqueErrors, topGroups (with
 *     count, severity, source, sample, suggestedFix hint), and a 'since'
 *     timestamp so Mavis can also GET /api/cron/cleanup-views to remove the
 *     very old ones if needed.
 *
 * Auto-fix support:
 *  POST /api/agent/session-start { autoFix: true, branch: '...' }
 *  → returns the same digest PLUS a 'autoFixCandidates' list of items that
 *    Mavis Cloud / a future pipeline can apply without human review (typos,
 *    missing imports, deprecated APIs, etc.). For now, this is just data —
 *    the actual decision logic lives in Mavis itself.
 *
 * Auth: open GET (no auth) — Mavis can call from any environment.
 * POST requires CRON_SECRET or AGENT_REPORT_TOKEN (so a CI pipeline can
 * trigger the auto-fix candidates mode).
 */

import { NextRequest, NextResponse } from 'next/server';
import { d1All, d1Run, d1First, genId } from '@/lib/db-d1';
import { getSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hashMessage(msg: string): string {
  // Same hash as nightly-cleanup so groups are stable across the two
  // endpoints (Mavis can match them up).
  let h = 0;
  for (let i = 0; i < msg.length; i++) {
    h = ((h << 5) - h + msg.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function shortMsg(msg: string, max = 200): string {
  return msg.length > max ? msg.slice(0, max - 3) + '...' : msg;
}

/**
 * 2026-09-06: auto-fix classifier.
 * Returns true if the error looks like a trivial Mavis-auto-fixable bug:
 *  - Syntax/import/typo (small fixes)
 *  - Missing null check (small defensive fix)
 *  - Deprecated API call (rename to new one)
 *  - Hard-coded production URL / env var swap
 *  - Property typo (e.g. 'request.path' instead of 'requestPath')
 *  - Missing await (concrete code pattern)
 *
 * Returns false for:
 *  - External service errors (Vercel, Resend quota, etc.) — DEFERRED
 *  - Vague stack traces without a clear line — DEFERRED
 *  - User-input validation — DEFERRED
 *  - Anything mentioning 'NOT NULL constraint' on existing data — DEFERRED
 *  - Anything mentioning 'no such table' or 'no such column' (schema migration needed)
 */
function isAutoFixCandidate(group: { sample: any }): boolean {
  const msg = (group.sample.message || '').toLowerCase();
  const source = (group.sample.source || '').toLowerCase();
  const url = (group.sample.url || group.sample.requestPath || '').toLowerCase();

  // DEFER: external service / quota / network
  if (
    msg.includes('insufficient_quota') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('tls') ||
    msg.includes('certificate') ||
    msg.includes('openai') ||
    msg.includes('resend') ||
    msg.includes('cloudflare') ||
    msg.includes('vercel') ||
    msg.includes('webhook') ||
    msg.includes('email send')
  ) return false;

  // DEFER: schema migrations
  if (
    msg.includes('no such table') ||
    msg.includes('no such column') ||
    msg.includes('not null constraint') ||
    msg.includes('unique constraint')
  ) return false;

  // DEFER: user input
  if (
    msg.includes('validation') ||
    msg.includes('invalid email') ||
    msg.includes('invalid password') ||
    msg.includes('required field') ||
    msg.includes('malformed')
  ) return false;

  // DEFER: vague / no clear culprit
  if (msg.length < 30) return false;
  if (!url && !msg.includes('error') && !msg.includes('failed')) return false;

  // AUTO-FIX patterns
  if (
    msg.includes('is not a function') ||        // typo / missing import
    msg.includes('cannot read property') ||     // null check
    msg.includes('cannot read properties') ||   // null check
    msg.includes('is not defined') ||           // typo
    msg.includes('unexpected token') ||         // syntax
    msg.includes('expected') ||                  // syntax
    msg.includes('does not exist on type') ||  // TS error
    msg.includes('property') && msg.includes('does not exist') ||  // typo
    msg.includes('await') && msg.includes('of') && msg.includes('non-promise') ||  // missing await
    msg.includes('deprecated') ||
    msg.includes('missing import') ||
    msg.includes('module not found') ||
    msg.includes("can't resolve") ||
    msg.includes('unable to resolve') ||
    msg.includes('process.env') && msg.includes('undefined') ||  // env var missing
    msg.includes('unhandledrejection') ||
    msg.includes('unhandled rejection')
  ) return true;

  // Default: require human review
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const since = Date.now() - 24 * 60 * 60 * 1000;

    // 1. Fetch from BOTH sources, last 24h, not already seen
    //    (ErrorLog.seenBySession = 0 AND CloudflareLog.seenBySession = 0)
    //    Note: we use a custom marker column that we need to ensure exists.
    //    We default to 0 if the column is missing (old schema).

    let errorLogRows: any[] = [];
    let cloudflareLogRows: any[] = [];

    try {
      errorLogRows = await d1All(
        `SELECT id, level, source, message, url, createdAt, userId
         FROM ErrorLog
         WHERE (seenBySession IS NULL OR seenBySession = 0)
           AND createdAt >= ?
           AND level IN ('ERROR', 'CRITICAL')
         ORDER BY createdAt DESC
         LIMIT 100`,
        since,
      );
    } catch (e) {
      // Column might not exist yet (old schema) — fall back to plain select
      console.warn('[session-start] ErrorLog seenBySession query failed:', (e as Error).message);
      try {
        errorLogRows = await d1All(
          `SELECT id, level, source, message, url, createdAt, userId
           FROM ErrorLog
           WHERE createdAt >= ?
             AND level IN ('ERROR', 'CRITICAL')
           ORDER BY createdAt DESC
           LIMIT 100`,
          since,
        );
      } catch {}
    }

    try {
      cloudflareLogRows = await d1All(
        `SELECT id, level, message, requestPath, responseStatusCode, source, createdAt
         FROM CloudflareLog
         WHERE (seenBySession IS NULL OR seenBySession = 0)
           AND createdAt >= ?
         ORDER BY createdAt DESC
         LIMIT 100`,
        since,
      );
    } catch (e) {
      console.warn('[session-start] CloudflareLog seenBySession query failed:', (e as Error).message);
      try {
        cloudflareLogRows = await d1All(
          `SELECT id, level, message, requestPath, responseStatusCode, source, createdAt
           FROM CloudflareLog
           WHERE createdAt >= ?
           ORDER BY createdAt DESC
           LIMIT 100`,
          since,
        );
      } catch {}
    }

    // 2. Normalize and combine
    const allErrors: any[] = [
      ...errorLogRows.map((e: any) => ({
        id: e.id,
        level: e.level || 'ERROR',
        source: e.source || 'errorlog',
        message: e.message || '',
        url: e.url || '',
        createdAt: e.createdAt,
      })),
      ...cloudflareLogRows.map((c: any) => ({
        id: c.id,
        level: c.level || 'error',
        source: c.source || 'cloudflare',
        message: c.message || '',
        url: c.requestPath || '',
        createdAt: c.createdAt,
      })),
    ];

    // 3. Group by message hash
    const grouped = new Map<string, {
      count: number;
      firstSeen: number;
      lastSeen: number;
      sample: any;
      severities: Set<string>;
      sources: Set<string>;
      ids: string[];
    }>();
    for (const e of allErrors) {
      const key = hashMessage(e.message);
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
        existing.severities.add(e.level);
        existing.sources.add(e.source);
        existing.ids.push(e.id);
        if (e.createdAt > existing.lastSeen) existing.lastSeen = e.createdAt;
        if (e.createdAt < existing.firstSeen) existing.firstSeen = e.createdAt;
      } else {
        grouped.set(key, {
          count: 1,
          firstSeen: e.createdAt,
          lastSeen: e.createdAt,
          sample: e,
          severities: new Set([e.level]),
          sources: new Set([e.source]),
          ids: [e.id],
        });
      }
    }

    // 4. Sort by count desc
    const topGroups = Array.from(grouped.values())
      .sort((a, b) => b.count - a.count)
      .map((g) => ({
        groupKey: hashMessage(g.sample.message),
        count: g.count,
        severities: Array.from(g.severities),
        sources: Array.from(g.sources),
        firstSeen: new Date(g.firstSeen).toISOString(),
        lastSeen: new Date(g.lastSeen).toISOString(),
        message: shortMsg(g.sample.message, 300),
        url: g.sample.url,
        ids: g.ids.slice(0, 5), // sample of IDs
        autoFixCandidate: isAutoFixCandidate(g),
      }));

    // 5. Mark as seen (best effort, don't fail the response if it errors)
    const allIds = allErrors.map((e) => e.id);
    if (allIds.length > 0) {
      try {
        // Mark in ErrorLog
        const errIds = errorLogRows.map((e: any) => e.id);
        if (errIds.length > 0) {
          const placeholders = errIds.map(() => '?').join(',');
          await d1Run(
            `UPDATE ErrorLog SET seenBySession = 1, updatedAt = ? WHERE id IN (${placeholders})`,
            Date.now(), ...errIds,
          );
        }
        const cfIds = cloudflareLogRows.map((c: any) => c.id);
        if (cfIds.length > 0) {
          const placeholders = cfIds.map(() => '?').join(',');
          await d1Run(
            `UPDATE CloudflareLog SET seenBySession = 1 WHERE id IN (${placeholders})`,
            ...cfIds,
          );
        }
      } catch (e) {
        console.warn('[session-start] mark-seen failed (column may not exist):', (e as Error).message);
      }
    }

    // 6. Log the session start
    console.log(`[agent/session-start] Mavis session started. totalErrors=${allErrors.length} uniqueGroups=${topGroups.length} autoFixCandidates=${topGroups.filter(g => g.autoFixCandidate).length}`);

    return NextResponse.json({
      ok: true,
      sessionStartedAt: new Date().toISOString(),
      since: new Date(since).toISOString(),
      totalErrors: allErrors.length,
      uniqueGroups: topGroups.length,
      autoFixCandidates: topGroups.filter((g) => g.autoFixCandidate).length,
      groups: topGroups,
      hint: allErrors.length === 0
        ? '✅ No new errors in the last 24h.'
        : topGroups.filter(g => g.autoFixCandidate).length > 0
        ? `🤖 ${topGroups.filter(g => g.autoFixCandidate).length} group(s) look auto-fixable. Mavis can apply them without review.`
        : `🧐 ${topGroups.length} group(s) need human review. Mavis should propose fixes.`,
    });
  } catch (err: any) {
    console.error('[agent/session-start] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

/**
 * POST endpoint: returns the digest + a list of auto-fixable candidates
 * that an external orchestrator (Mavis Cloud, CI) can apply directly.
 * Requires CRON_SECRET or AGENT_REPORT_TOKEN.
 */
export async function POST(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization');
  const cronToken = await getSecret('CRON_SECRET');
  const agentToken = await getSecret('AGENT_REPORT_TOKEN');
  const expectedCron = cronToken ? `Bearer ${cronToken}` : null;
  const expectedAgent = agentToken ? `Bearer ${agentToken}` : null;
  if (
    !auth ||
    !((expectedCron && auth === expectedCron) || (expectedAgent && auth === expectedAgent))
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Reuse GET logic but also accept body params
  try {
    const body = await req.json().catch(() => ({}));
    const includeAll = body.includeAll === true; // include non-auto-fix groups too

    // Call GET internally
    const fakeReq = new Request('http://internal/api/agent/session-start', { method: 'GET' });
    const getRes = await GET(fakeReq as any);
    const digest = await getRes.json();

    if (includeAll) {
      return NextResponse.json(digest);
    }

    // Default: only return auto-fix candidates
    return NextResponse.json({
      ok: true,
      autoFixCandidates: digest.groups?.filter((g: any) => g.autoFixCandidate) || [],
      count: digest.groups?.filter((g: any) => g.autoFixCandidate).length || 0,
      hint: 'Pass { includeAll: true } to also get groups needing human review.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal error' },
      { status: 500 },
    );
  }
}

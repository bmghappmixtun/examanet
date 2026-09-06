// @ts-nocheck
/**
 * Nightly error cleanup cron
 * Runs every day at 2:00 AM UTC (3:00 AM Tunisia, UTC+1)
 *
 * What it does:
 * 1. Reads all un-seen CRITICAL/ERROR errors from the last 7 days
 * 2. Groups them by error type (same message hash)
 * 3. Marks them all as seen (agentSeen = true)
 * 4. Posts a summary to Discord (for the human to skim)
 * 5. Writes a JSON digest to a stable file that Mavis reads at session start
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from 'next/server';
import { d1All, d1Run } from '@/lib/db-d1';
import { requireCronSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

function hashMessage(msg: string): string {
  // Simple hash to group similar errors
  let h = 0;
  for (let i = 0; i < msg.length; i++) {
    h = ((h << 5) - h + msg.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function shortMsg(msg: string, max = 80): string {
  return msg.length > max ? msg.slice(0, max - 3) + '...' : msg;
}

export async function GET(req: NextRequest) {
  // 2026-09-05: use cf-auth helper for cross-env secret
  const authErr = await requireCronSecret(req);
  if (authErr) return authErr;

  // Look at last 7 days
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // 2026-09-05: Replaced Prisma findMany/updateMany with raw D1 SQL
  const allRows: any[] = await d1All(
    `SELECT id, level as severity, source, message, url, createdAt, userEmail
     FROM ErrorLog
     WHERE level IN ('ERROR', 'CRITICAL')
       AND createdAt >= ?
     ORDER BY createdAt DESC
     LIMIT 200`,
    since,
  );

  const unSeen = allRows.filter((e) => e.agentSeen === 0 || e.agentSeen === false);
  const unSeenCritical = unSeen.filter((e) => e.severity === 'CRITICAL');
  const unSeenError = unSeen.filter((e) => e.severity === 'ERROR');

  // Group by message hash
  const grouped = new Map<string, { count: number; sample: any; severities: Set<string> }>();
  for (const e of unSeen) {
    const key = hashMessage(e.message || '');
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
      existing.severities.add(e.severity);
    } else {
      grouped.set(key, { count: 1, sample: e, severities: new Set([e.severity]) });
    }
  }

  const topGroups = Array.from(grouped.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Mark all unseen as seen
  if (unSeen.length > 0) {
    const ids = unSeen.map((e) => e.id);
    const placeholders = ids.map(() => '?').join(',');
    await d1Run(
      `UPDATE ErrorLog SET agentSeen = 1, updatedAt = ? WHERE id IN (${placeholders})`,
      Date.now(),
      ...ids,
    );
  }

  // Post summary to Discord
  let discordPosted = false;
  if (DISCORD_WEBHOOK_URL && unSeen.length > 0) {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: 'Total unseen', value: String(unSeen.length), inline: true },
      { name: 'Critical', value: String(unSeenCritical.length), inline: true },
      { name: 'Error', value: String(unSeenError.length), inline: true },
    ];

    for (const g of topGroups.slice(0, 6)) {
      const sevEmoji = g.severities.has('CRITICAL') ? '🚨' : '⚠️';
      fields.push({
        name: `${sevEmoji} ×${g.count} — ${g.sample.severity}/${g.sample.source}`,
        value: `\`\`\`${shortMsg(g.sample.message, 200)}\`\`\``,
      });
    }

    const embed = {
      title: '🌙 Rapport nocturne des erreurs',
      description: `Mavis va examiner ces erreurs et corriger ce qui peut l'être automatiquement.`,
      color: unSeenCritical.length > 0 ? 0x7f1d1d : 0xa16207,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'Examanet nightly cleanup · 3:00 Tunisia' },
    };

    try {
      const res = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🌙 **Rapport nocturne (3h Tunisie)** — ${unSeen.length} erreur(s) non-vue(s) sur 7 jours`,
          embeds: [embed],
          allowed_mentions: { parse: [] },
        }),
      });
      discordPosted = res.ok;
    } catch (e) {
      console.error('[nightly-cleanup] Discord post failed:', e);
    }
  }

  // 2026-09-06: also clean up old notifications to keep the table small.
  // Strategy: delete notifications older than 90 days OR read notifications
  // older than 30 days. This prevents the table from growing unbounded.
  const NINETY_DAYS_AGO = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_AGO = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const oldNotifResult: any = await d1Run(
    'DELETE FROM Notification WHERE createdAt < ? OR (isRead = 1 AND createdAt < ?)',
    NINETY_DAYS_AGO,
    THIRTY_DAYS_AGO,
  );
  const notifDeleted = oldNotifResult?.meta?.changes ?? 0;
  console.log(`[nightly-cleanup] Deleted ${notifDeleted} old notifications`);

  // Build a digest that Mavis can read
  const digest = {
    generatedAt: new Date().toISOString(),
    windowDays: 7,
    totalUnseen: unSeen.length,
    critical: unSeenCritical.length,
    error: unSeenError.length,
    groupedCount: grouped.size,
    topGroups: topGroups.map((g) => ({
      count: g.count,
      severities: Array.from(g.severities),
      reference: g.sample.reference,
      message: g.sample.message,
      url: g.sample.url,
      source: g.sample.source,
      createdAt: g.sample.createdAt,
      stack: g.sample.stack?.split('\n').slice(0, 5).join('\n'),
      context: g.sample.context,
    })),
    notificationsDeleted: notifDeleted,
    discordPosted,
  };

  return NextResponse.json({
    ok: true,
    digest,
  });
}

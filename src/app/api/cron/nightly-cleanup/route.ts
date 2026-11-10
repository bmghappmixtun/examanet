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
import { requireCronSecret, getSecret } from '@/lib/cf-auth';
import { isThirdPartyError } from '@/lib/error-third-party';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 2026-10-26: `process.env` est figé au BUILD dans un CF Worker → un
// `wrangler secret put DISCORD_WEBHOOK_URL` n'était jamais visible en
// runtime (le cron se taisait silencieusement). Lecture via getSecret()
// (ctx.env d'abord) DANS le handler.

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
  // 2026-11-01 FIX (nightly muet depuis des semaines) : `agentSeen` n'était
  // PLUS dans la liste SELECT (régression c7aa53c8, migration vers le SQL
  // brut) alors que le filtre ligne 60 teste `e.agentSeen === 0 || ===
  // false`. Comme `e.agentSeen` valait undefined, AUCUNE ligne ne passait le
  // filtre => `unSeen` toujours vide => (a) rien n'était marqué comme vu,
  // (b) le rapport Discord était sauté (condition `unSeen.length > 0`),
  // (c) le digest renvoyait 0 erreur -> le nightly ne voyait rien et
  // relisait le backlog. `stack` et `context` ont le même problème (absents
  // du SELECT alors que le digest les expose).
  const allRows: any[] = await d1All(
    `SELECT id, level as severity, source, message, url, createdAt, userEmail,
            agentSeen, stack, context
     FROM ErrorLog
     WHERE level IN ('ERROR', 'CRITICAL', 'error')
       AND source != 'PROBE'   -- 2026-11-01: sondes de diagnostic exclues du rapport
       AND createdAt >= ?
     ORDER BY createdAt DESC
     LIMIT 200`,
    since,
  );

  // `!e.agentSeen` couvre 0 / false / null / undefined (agentSeen est un
  // INTEGER 0|1 en base) : une colonne absente ne doit jamais faire passer
  // une ligne pour "déjà vue".
  const unSeen = allRows.filter((e) => !e.agentSeen);

  // 2026-11-10 (E3) : on ne NOTIFIE plus que les erreurs attribuables à notre
  // code. Les erreurs 100 % tierces (extensions navigateur, scripts injectés)
  // sont toujours marquées comme vues (pour ne pas s'accumuler) mais elles
  // ne déclenchent plus de notification Discord ni de groupe de travail.
  const thirdPartyRows = unSeen.filter((e) => isThirdPartyError(e));
  const appRows = unSeen.filter((e) => !isThirdPartyError(e));
  const thirdPartyCount = thirdPartyRows.length;

  const unSeenCritical = appRows.filter((e) => String(e.severity || '').toUpperCase() === 'CRITICAL');
  const unSeenError = appRows.filter((e) => String(e.severity || '').toUpperCase() === 'ERROR');

  // Group by message hash
  const grouped = new Map<string, { count: number; sample: any; severities: Set<string> }>();
  for (const e of appRows) {
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
  // 2026-10-26: lu au moment de la requête (binding runtime).
  const DISCORD_WEBHOOK_URL = (await getSecret('DISCORD_WEBHOOK_URL')) || '';
  if (DISCORD_WEBHOOK_URL && appRows.length > 0) {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: 'Total à traiter', value: String(appRows.length), inline: true },
      { name: 'Critical', value: String(unSeenCritical.length), inline: true },
      { name: 'Error', value: String(unSeenError.length), inline: true },
    ];
    if (thirdPartyCount > 0) {
      fields.push({
        name: 'Ignorées (tiers)',
        value: `${thirdPartyCount} — extensions / scripts injectés, non attribuables à notre code`,
        inline: false,
      });
    }

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
          content: `🌙 **Rapport nocturne (3h Tunisie)** — ${appRows.length} erreur(s) à traiter sur 7 jours${thirdPartyCount > 0 ? ` (+${thirdPartyCount} ignorée(s), tiers)` : ''}`,
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
    appErrors: appRows.length,
    thirdPartyIgnored: thirdPartyCount,
    critical: unSeenCritical.length,
    error: unSeenError.length,
    groupedCount: grouped.size,
    topGroups: topGroups.map((g) => ({
      count: g.count,
      severities: Array.from(g.severities),
      reference: g.sample.id, // pas de colonne `reference` dans ErrorLog : l'id de la ligne
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

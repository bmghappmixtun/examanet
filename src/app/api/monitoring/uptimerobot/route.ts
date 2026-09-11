// @ts-nocheck
/**
 * /api/monitoring/uptimerobot
 *
 * Webhook endpoint for UptimeRobot alerts.
 * Called when UptimeRobot detects a down event.
 *
 * Flow:
 * 1. Log the alert to D1 (for the agent to query via cron)
 * 2. Attempt auto-rollback via CF Workers API (to previous known-good version)
 * 3. POST to Discord (if DISCORD_WEBHOOK_URL secret is set) so user + agent see it
 * 4. Return 200 OK to UptimeRobot
 *
 * Setup:
 * - Create alert contact in UptimeRobot with type=WebHook
 * - URL: https://examanet.com/api/monitoring/uptimerobot
 * - POST JSON: { "monitorID": ..., "monitorURL": ..., "alertType": "down", ... }
 * - Optional: add ?secret=YOUR_SECRET for verification
 *
 * The auto-rollback reverts the Worker to the second-most-recent version
 * (the previous one before the current). If the previous version is also
 * bad, the agent will need to investigate manually.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface UptimeRobotAlert {
  monitorID?: number;
  monitorURL?: string;
  monitorFriendlyName?: string;
  alertType?: 'down' | 'up' | 'ssl' | 'expiration';
  alertTypeFriendly?: string;
  alertDetails?: string;
  alertDuration?: number;
  monitorType?: number;
  monitorInterval?: number;
}

export async function POST(req: NextRequest) {
  const CF_ACCOUNT_ID = '59cffdeaadf3809cc3d2039c43f836e0';
  const SCRIPT_NAME = 'examanet-prod';
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
  const DISCORD_WEBHOOK_URL = process.env.UPTIMEROBOT_DISCORD_WEBHOOK_URL;
  const SHARED_SECRET = process.env.UPTIMEROBOT_WEBHOOK_SECRET;

  // 1. Parse + verify
  let body: UptimeRobotAlert;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Optional: verify shared secret
  if (SHARED_SECRET) {
    const url = new URL(req.url);
    const provided = url.searchParams.get('secret') || req.headers.get('x-webhook-secret');
    if (provided !== SHARED_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const isDown = body.alertType === 'down' || String(body.alertType).toLowerCase() === 'down';
  if (!isDown) {
    // Up event - no action needed
    return NextResponse.json({ ok: true, action: 'none', reason: 'not a down alert' });
  }

  const monitorURL = body.monitorURL || 'unknown';
  const monitorName = body.monitorFriendlyName || 'unknown';
  const alertDetails = body.alertDetails || '';
  const alertDuration = body.alertDuration || 0;

  console.log(`[UPTIMEROBOT] DOWN: ${monitorName} (${monitorURL}) - ${alertDetails} (${alertDuration}s)`);

  // 2. Log to D1
  let alertId: number | null = null;
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    const result = await db.prepare(
      `INSERT INTO MonitoringAlert (source, monitorId, monitorName, monitorUrl, alertType, alertDetails, alertDuration, createdAt, resolved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).bind(
      'uptimerobot',
      body.monitorID || 0,
      monitorName,
      monitorURL,
      'down',
      alertDetails,
      alertDuration,
      Date.now()
    ).run();
    alertId = result?.meta?.last_row_id || null;
  } catch (e: any) {
    console.error('[UPTIMEROBOT] D1 log failed:', e?.message);
    // Continue - don't fail the webhook if logging fails
  }

  // 3. Attempt auto-rollback via CF Workers API
  let rollbackResult: any = { attempted: false };
  if (CF_API_TOKEN) {
    rollbackResult = await attemptRollback(CF_ACCOUNT_ID, SCRIPT_NAME, CF_API_TOKEN);
  } else {
    rollbackResult = { attempted: false, reason: 'no CF_API_TOKEN' };
  }

  // 4. Notify via Discord (if configured)
  if (DISCORD_WEBHOOK_URL) {
    await notifyDiscord(DISCORD_WEBHOOK_URL, {
      monitorName,
      monitorURL,
      alertDetails,
      alertDuration,
      rollbackResult,
      alertId,
    });
  }

  return NextResponse.json({
    ok: true,
    action: 'logged_and_rollback_attempted',
    alertId,
    rollback: rollbackResult,
  });
}

async function attemptRollback(accountId: string, scriptName: string, apiToken: string): Promise<any> {
  try {
    // List recent versions (newest first)
    const listRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/versions?per_page=5`,
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );
    if (!listRes.ok) {
      return { attempted: true, success: false, error: `list failed: ${listRes.status}` };
    }
    const listData = await listRes.json();
    const versions = listData?.result?.items || [];
    if (versions.length < 2) {
      return { attempted: true, success: false, error: 'less than 2 versions available' };
    }

    // The newest (versions[0]) is the current (broken). Roll back to versions[1].
    const currentVersion = versions[0];
    const targetVersion = versions[1];

    // Rollback by setting the active deployment to the target version
    // CF API expects: { "versions": [{ "percentage": 100, "version_id": "..." }] }
    const rollbackRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/deployments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          strategy: 'percentage',
          versions: [{ percentage: 100, version_id: targetVersion.id }],
        }),
      }
    );

    if (!rollbackRes.ok) {
      const err = await rollbackRes.text();
      return {
        attempted: true,
        success: false,
        error: `rollback failed: ${rollbackRes.status}`,
        details: err.substring(0, 200),
      };
    }

    return {
      attempted: true,
      success: true,
      fromVersion: currentVersion.id,
      toVersion: targetVersion.id,
      fromCreated: currentVersion.metadata?.created_on,
      toCreated: targetVersion.metadata?.created_on,
    };
  } catch (e: any) {
    return { attempted: true, success: false, error: e?.message };
  }
}

async function notifyDiscord(webhookUrl: string, data: any): Promise<void> {
  const { monitorName, monitorURL, alertDetails, alertDuration, rollbackResult, alertId } = data;
  const rollbackEmoji = rollbackResult?.success ? '✅' : rollbackResult?.attempted ? '⚠️' : 'ℹ️';
  const rollbackText = rollbackResult?.success
    ? `Auto-rollback done: ${rollbackResult.fromVersion?.substring(0, 8)} → ${rollbackResult.toVersion?.substring(0, 8)}`
    : rollbackResult?.attempted
    ? `Auto-rollback failed: ${rollbackResult.error}`
    : 'Auto-rollback skipped (no token)';

  const payload = {
    content: `🚨 **UptimeRobot alert: ${monitorName} DOWN**`,
    embeds: [
      {
        title: monitorName,
        url: monitorURL,
        color: rollbackResult?.success ? 0x10b981 : 0xef4444,
        fields: [
          { name: 'URL', value: monitorURL, inline: false },
          { name: 'Duration', value: `${alertDuration}s`, inline: true },
          { name: 'Details', value: alertDetails || 'n/a', inline: false },
          { name: 'Action', value: `${rollbackEmoji} ${rollbackText}`, inline: false },
          { name: 'Alert ID', value: alertId ? String(alertId) : 'n/a', inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'examanet-prod monitoring' },
      },
    ],
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    console.error('[UPTIMEROBOT] Discord notify failed:', e?.message);
  }
}

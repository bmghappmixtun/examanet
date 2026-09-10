// @ts-nocheck
/**
 * /api/monitoring/uptimerobot/alerts
 *
 * GET endpoint for the agent (Mavis cron) to check for unresolved monitoring alerts.
 * Returns recent unresolved alerts sorted by createdAt DESC.
 *
 * Auth: requires a secret query param or x-monitoring-secret header.
 * Set UPTIMEROBOT_ALERTS_SECRET in the worker env.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const provided = url.searchParams.get('secret') || req.headers.get('x-monitoring-secret');
  const expected = process.env.UPTIMEROBOT_ALERTS_SECRET || 'examanet-monitor-2026';
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = parseInt(url.searchParams.get('since') || '0', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);

  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    const result = await db.prepare(
      `SELECT id, source, monitorId, monitorName, monitorUrl, alertType, alertDetails, alertDuration, createdAt, resolved
       FROM MonitoringAlert
       WHERE createdAt > ? AND resolved = 0
       ORDER BY createdAt DESC
       LIMIT ?`
    ).bind(since, limit).all();

    return NextResponse.json({
      ok: true,
      count: (result?.results || []).length,
      alerts: result?.results || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

// POST to mark an alert as resolved
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const provided = url.searchParams.get('secret') || req.headers.get('x-monitoring-secret');
  const expected = process.env.UPTIMEROBOT_ALERTS_SECRET || 'examanet-monitor-2026';
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const alertId = parseInt(body.alertId, 10);
  if (!alertId) {
    return NextResponse.json({ error: 'alertId required' }, { status: 400 });
  }

  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    await db.prepare(
      `UPDATE MonitoringAlert SET resolved = 1, resolvedAt = ? WHERE id = ?`
    ).bind(Date.now(), alertId).run();
    return NextResponse.json({ ok: true, alertId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

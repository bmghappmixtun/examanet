// @ts-nocheck
/**
 * /api/cron/monitor-alerts
 * 
 * PERF 2026-09-02: Performance and error monitoring with alerts.
 * Called every 5min by CF Cron trigger.
 * 
 * What it does:
 * 1. Reads the last 5min of metrics from KV
 * 2. Calculates error rate and P95 latency
 * 3. If thresholds exceeded, sends email via Resend
 * 4. Throttles alerts (max 1 per endpoint per 30min)
 * 
 * Thresholds (configurable):
 * - Error rate > 10% (5xx responses / total)
 * - P95 latency > 1000ms
 * 
 * Storage: Uses CF Workers KV (examanet-prod-app-cache namespace).
 * Key: "metric:{timestamp}:{path}" with { durationMs, statusCode }
 * Each request writes 1 entry. We keep last 30min of data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Resend } from 'resend';
import { requireCronSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Alert thresholds
const ERROR_RATE_THRESHOLD = 0.10; // 10%
const P95_THRESHOLD_MS = 1000;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min
const WINDOW_MS = 5 * 60 * 1000; // 5 min
const ENDPOINTS_TO_MONITOR = [
  '/api/health',
  '/api/ressources-data',
  '/api/professeurs/data',
  '/api/ressources/{id}/detail',
  '/fr',
  '/fr/ressources',
  '/fr/professeurs',
  '/admin',
  '/admin/utilisateurs',
  '/admin/catalog',
];

export async function GET(req: NextRequest) {
  // Auth check (2026-09-05: use cf-auth helper for CF env secret support)
  const authErr = await requireCronSecret(req, { devDefault: 'monitor-secret' });
  if (authErr) return authErr;
  
  try {
    const ctx = await getCloudflareContext({ async: true });
    const kv = (ctx as any).env.APP_CACHE;
    
    if (!kv) {
      return NextResponse.json({ error: 'KV not available' }, { status: 503 });
    }
    
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    
    // List all metric keys in window
    const metricKeys = await listKeysInWindow(kv, windowStart, now);
    
    // Aggregate by endpoint
    const stats = new Map<string, { total: number; errors: number; latencies: number[] }>();
    
    for (const key of metricKeys) {
      const value = await kv.get(key, { type: 'json' });
      if (!value) continue;
      const m = value as { path: string; durationMs: number; statusCode: number };
      
      if (!stats.has(m.path)) {
        stats.set(m.path, { total: 0, errors: 0, latencies: [] });
      }
      const s = stats.get(m.path)!;
      s.total++;
      if (m.statusCode >= 500) s.errors++;
      s.latencies.push(m.durationMs);
    }
    
    // Check each endpoint against thresholds
    const alerts: any[] = [];
    for (const [path, s] of stats.entries()) {
      if (!ENDPOINTS_TO_MONITOR.some(ep => path === ep || path.startsWith(ep))) continue;
      if (s.total < 10) continue; // Need at least 10 samples to be meaningful
      
      const errorRate = s.errors / s.total;
      s.latencies.sort((a, b) => a - b);
      const p95 = s.latencies[Math.floor(s.latencies.length * 0.95)] || 0;
      
      const issues: string[] = [];
      if (errorRate > ERROR_RATE_THRESHOLD) {
        issues.push(`Error rate ${(errorRate * 100).toFixed(1)}% > ${ERROR_RATE_THRESHOLD * 100}% (${s.errors}/${s.total})`);
      }
      if (p95 > P95_THRESHOLD_MS) {
        issues.push(`P95 ${p95}ms > ${P95_THRESHOLD_MS}ms`);
      }
      
      if (issues.length > 0) {
        // Check cooldown
        const cooldownKey = `alert-cooldown:${path}`;
        const lastAlert = await kv.get(cooldownKey);
        const lastAlertTime = lastAlert ? parseInt(lastAlert) : 0;
        
        if (now - lastAlertTime > ALERT_COOLDOWN_MS) {
          alerts.push({
            path,
            issues,
            total: s.total,
            errors: s.errors,
            p95,
            errorRate: (errorRate * 100).toFixed(1) + '%',
          });
          // Set cooldown
          await kv.put(cooldownKey, String(now), { expirationTtl: 3600 });
        }
      }
    }
    
    // Send email if there are alerts
    if (alerts.length > 0) {
      try {
        const resendApiKey = (ctx as any).env.RESEND_API_KEY;
        const emailFrom = (ctx as any).env.EMAIL_FROM;
        if (resendApiKey && emailFrom) {
          const resend = new Resend(resendApiKey);
          await resend.emails.send({
            from: emailFrom,
            to: 'boutiti.mehdi@gmail.com',
            subject: `🚨 Examanet Alert: ${alerts.length} endpoint(s) degraded`,
            html: formatAlertEmail(alerts),
          });
        }
      } catch (e) {
        console.error('[monitor-alerts] email send failed:', (e as any).message);
      }
    }
    
    // Clean up old metric keys (older than 30 min)
    await cleanupOldMetrics(kv, now - 30 * 60 * 1000);
    
    return NextResponse.json({
      window: `${new Date(windowStart).toISOString()} to ${new Date(now).toISOString()}`,
      endpointsMonitored: stats.size,
      alertsSent: alerts.length,
      alerts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

/**
 * List metric keys in the given time window.
 * Metric key format: "metric:{timestamp}:{path_hash}:{uuid}"
 */
async function listKeysInWindow(kv: any, start: number, end: number): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const result: any = await kv.list({ prefix: 'metric:', cursor, limit: 1000 });
    for (const k of result.keys || []) {
      // Parse timestamp from key
      const match = k.name.match(/^metric:(\d+):/);
      if (match) {
        const ts = parseInt(match[1]);
        if (ts >= start && ts <= end) {
          keys.push(k.name);
        }
      }
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return keys;
}

async function cleanupOldMetrics(kv: any, beforeTs: number) {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const result: any = await kv.list({ prefix: 'metric:', cursor, limit: 1000 });
    for (const k of result.keys || []) {
      const match = k.name.match(/^metric:(\d+):/);
      if (match) {
        const ts = parseInt(match[1]);
        if (ts < beforeTs) {
          await kv.delete(k.name);
          deleted++;
        }
      }
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return deleted;
}

function formatAlertEmail(alerts: any[]): string {
  const rows = alerts.map(a => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;"><code>${a.path}</code></td>
      <td style="padding: 8px; border: 1px solid #ddd;">${a.total} requests</td>
      <td style="padding: 8px; border: 1px solid #ddd; color: ${parseFloat(a.errorRate) > 20 ? '#dc2626' : '#f59e0b'};">${a.errorRate} errors</td>
      <td style="padding: 8px; border: 1px solid #ddd; color: ${a.p95 > 2000 ? '#dc2626' : '#f59e0b'};">${a.p95}ms P95</td>
    </tr>
    <tr>
      <td colspan="4" style="padding: 8px; border: 1px solid #ddd; color: #666;">${a.issues.join(' • ')}</td>
    </tr>
  `).join('');
  
  return `
    <h2>🚨 Examanet Performance Alerts</h2>
    <p>Detected at ${new Date().toISOString()}</p>
    <table style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Endpoint</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Volume</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Errors</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Latency</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p style="color: #666; margin-top: 20px;">
      Worker: examanet-prod • Cooldown: 30min per endpoint
    </p>
  `;
}

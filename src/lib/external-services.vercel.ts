/**
 * Vercel usage checker
 *
 * Endpoints:
 *   - GET /v1/billing/charges?from=ISO&to=ISO&teamId=X — FOCUS v1.3 JSONL
 *   - GET /v1/usage?from=ISO&to=ISO — legacy fallback
 *
 * Both use ISO 8601 date-time UTC format for from/to.
 */

const VERCEL_API = 'https://api.vercel.com';

export type VercelUsage = {
  periodStart: string;
  periodEnd: string;
  bandwidth: { used: number; unit: string; limit?: number };
  functions: { used: number; unit: string; limit?: number };
  builds: { used: number; unit: string; limit?: number };
  error?: string;
  username?: string;
  plan?: string;
  source?: 'billing-charges' | 'usage-v1' | 'none';
};

export async function checkVercelUsage(token: string): Promise<VercelUsage> {
  const empty = (overrides: Partial<VercelUsage> = {}): VercelUsage => ({
    periodStart: '',
    periodEnd: '',
    bandwidth: { used: 0, unit: 'GB' },
    functions: { used: 0, unit: 'hours' },
    builds: { used: 0, unit: 'builds' },
    source: 'none',
    ...overrides,
  });

  if (!token) return empty({ error: 'No Vercel token' });

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const fromISO = periodStart.toISOString();
  const toISO = periodEnd.toISOString();

  // Get user info
  let username: string | undefined;
  let plan: string | undefined;
  let teamId: string | undefined;
  try {
    const userRes = await fetch(`${VERCEL_API}/v2/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (userRes.ok) {
      const userData: any = await userRes.json();
      username = userData.user?.username;
      plan = userData.user?.plan;
      teamId = userData.user?.defaultTeamId;
    }
  } catch {}

  // Strategy 1: /v1/billing/charges (new, FOCUS v1.3 JSONL)
  const teamParam = teamId ? `&teamId=${teamId}` : '';
  const billingUrl = `${VERCEL_API}/v1/billing/charges?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}${teamParam}`;
  try {
    const res = await fetch(billingUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n').filter(Boolean);
      let bandwidth = 0;
      let bandwidthUnit = 'GB';
      let functionsGbSec = 0;
      let builds = 0;
      let foundAny = false;

      for (const line of lines) {
        try {
          const charge = JSON.parse(line);
          if (charge.ChargeCategory !== 'Usage') continue;
          foundAny = true;
          const service = (charge.ServiceName || '').toLowerCase();
          const qty = charge.ConsumedQuantity || 0;
          const unit = charge.ConsumedUnit || '';

          if (service.includes('bandwidth') || service.includes('data transfer')) {
            bandwidth += qty;
            bandwidthUnit = unit;
          } else if (
            service.includes('function') ||
            service.includes('compute') ||
            service.includes('execution') ||
            service.includes('invocation')
          ) {
            functionsGbSec += qty;
          } else if (service.includes('build')) {
            builds += qty;
          }
        } catch {}
      }

      if (foundAny) {
        return {
          periodStart: periodStart.toISOString().slice(0, 10),
          periodEnd: periodEnd.toISOString().slice(0, 10),
          bandwidth: normalizeBandwidth(bandwidth, bandwidthUnit),
          functions: normalizeFunctions(functionsGbSec),
          builds: { used: Math.round(builds), unit: 'builds' },
          username,
          plan,
          source: 'billing-charges',
        };
      }
    }
  } catch {}

  // Strategy 2: /v1/usage (legacy)
  const usageUrl = teamId
    ? `${VERCEL_API}/v1/teams/${teamId}/usage?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`
    : `${VERCEL_API}/v1/usage?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;
  try {
    const res = await fetch(usageUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data: any = await res.json();
      const usage = parseLegacyUsage(data);
      if (usage) {
        return {
          periodStart: periodStart.toISOString().slice(0, 10),
          periodEnd: periodEnd.toISOString().slice(0, 10),
          ...usage,
          username,
          plan,
          source: 'usage-v1',
        };
      }
    } else {
      const errText = await res.text().catch(() => '');
      return empty({
        error: `Vercel ${res.status}: ${errText.slice(0, 250)}`,
        username,
        plan,
      });
    }
  } catch (e: any) {
    return empty({ error: `Network: ${e?.message || 'erreur'}`, username, plan });
  }

  return empty({ username, plan });
}

function parseLegacyUsage(data: any): { bandwidth: any; functions: any; builds: any } | null {
  if (Array.isArray(data)) {
    let bw = 0,
      bwUnit = 'GB',
      fn = 0,
      fnUnit = 'hours',
      builds = 0;
    let found = false;
    for (const item of data) {
      found = true;
      const v = parseFloat(item.usageValue) || 0;
      const u = item.usageUnit || '';
      if (item.resource === 'bandwidth' || item.resource === 'fastDataTransfer') {
        bw += v;
        bwUnit = u;
      } else if (item.resource === 'serverlessFunctionExecution' || item.resource === 'functions') {
        fn += v;
        fnUnit = u;
      } else if (item.resource === 'builds') {
        builds += v;
      }
    }
    if (!found) return null;
    return {
      bandwidth: normalizeBandwidth(bw, bwUnit),
      functions: normalizeFunctions(fn, fnUnit),
      builds: { used: Math.round(builds), unit: 'builds' },
    };
  }
  if (typeof data === 'object' && data !== null) {
    return {
      bandwidth: normalizeBandwidth(
        parseFloat(data.bandwidth?.usageValue) || 0,
        data.bandwidth?.usageUnit || 'GB',
      ),
      functions: normalizeFunctions(
        parseFloat(data.serverlessFunctionExecution?.usageValue || data.functions?.usageValue) || 0,
        data.serverlessFunctionExecution?.usageUnit || data.functions?.usageUnit || 'hours',
      ),
      builds: {
        used: Math.round(parseFloat(data.builds?.usageValue) || 0),
        unit: 'builds',
      },
    };
  }
  return null;
}

function normalizeBandwidth(value: number, unit: string): { used: number; unit: string } {
  const u = (unit || '').toUpperCase();
  let gb = value;
  let normalizedUnit = 'GB';
  if (u === 'MB' || u === 'MBS') gb = value / 1024;
  else if (u === 'BYTES' || u === 'B') gb = value / (1024 * 1024 * 1024);
  else if (u === 'GB' || u === 'GBS') gb = value;
  else if (u === 'TB' || u === 'TBS') {
    gb = value * 1024;
    normalizedUnit = 'GB';
  } else normalizedUnit = unit || 'GB';
  return { used: parseFloat(gb.toFixed(3)), unit: normalizedUnit };
}

function normalizeFunctions(value: number, unit?: string): { used: number; unit: string } {
  const u = (unit || '').toLowerCase();
  let hours = value;
  let finalUnit = 'hours';
  if (u === 'gb-seconds' || u === 'gb-s' || u === 'gb-secs') hours = value / 3600;
  else if (u === 'gb-hours' || u === 'gb-h' || u === 'gb-hrs') hours = value;
  else if (u === 'ms' || u === 'milliseconds') hours = value / 1000 / 3600;
  else if (u === 'seconds' || u === 's') hours = value / 3600;
  else finalUnit = unit || 'GB-hours';
  return { used: parseFloat(hours.toFixed(2)), unit: finalUnit };
}

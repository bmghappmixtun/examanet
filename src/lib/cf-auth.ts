// @ts-nocheck
/**
 * CF Workers auth helpers.
 *
 * 2026-09-05: Created because `process.env.CRON_SECRET` is UNDEFINED inside
 * a CF Worker — secrets set via `wrangler secret put` come through the
 * `env` binding from `getCloudflareContext()`, not `process.env`.
 *
 * These helpers centralize the "get the secret from either env or process.env"
 * pattern so cron routes don't have to duplicate it.
 *
 * Usage:
 *   import { requireCronSecret } from '@/lib/cf-auth';
 *
 *   export async function GET(req: NextRequest) {
 *     const auth = await requireCronSecret(req);
 *     if (auth) return auth; // 401 Response
 *     // ... do the work
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/** Read a secret that may be in CF env (production) or process.env (dev). */
export async function getSecret(name: string, devDefault?: string): Promise<string | undefined> {
  // 1. Try CF env (wrangler secret put → ctx.env)
  try {
    const ctx = await getCloudflareContext({ async: true });
    const v = (ctx as any).env?.[name];
    if (v) return v;
  } catch {
    // No context available (dev mode, e.g. `next dev`)
  }
  // 2. Try process.env (local dev, tests)
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name];
  }
  // 3. Fallback
  return devDefault;
}

/**
 * Verify the request has a valid cron secret (in Authorization header or
 * ?secret= query). Returns null if OK, or a 401 Response.
 *
 * Accepts any of: CRON_SECRET, AGENT_REPORT_TOKEN.
 */
export async function requireCronSecret(
  req: NextRequest,
  opts: { allowAgentToken?: boolean; devDefault?: string } = {},
): Promise<NextResponse | null> {
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret');
  const headerSecret =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    null;
  const provided = querySecret || headerSecret;

  if (!provided) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cronSecret = await getSecret('CRON_SECRET', opts.devDefault);
  if (provided === cronSecret) return null;

  if (opts.allowAgentToken) {
    const agentToken = await getSecret('AGENT_REPORT_TOKEN');
    if (agentToken && provided === agentToken) return null;
  }

  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

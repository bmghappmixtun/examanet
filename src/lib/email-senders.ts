/**
 * Per-source-site email senders.
 *
 * 2026-10-21: a prof invited from tunisiecollege.net should receive the
 * invitation from contact@tunisiecollege.net, and a prof coming from
 * devoirat.net from contact@devoirat.net. The invitation CONTENT already
 * varies per site (see jotform-invitation.ts) — this makes the From
 * address vary the same way.
 *
 * Why Resend and not Cloudflare Email Service:
 *  - devoirat.net / tunisiecollege.net DNS is hosted by JIMDO
 *    (ns13/ns14.jimdo.com), NOT Cloudflare. Only examanet.com is on
 *    Cloudflare nameservers, and it's the only zone in the account that
 *    owns the Worker. Onboarding a sending domain to Cloudflare Email
 *    Service would require moving DNS off Jimdo (breaks the hosted
 *    sites) and the zone would have to live in the worker's account.
 *  - Cloudflare Email Service has no equivalent of Resend's per-message
 *    ID + webhooks, which the delivery-sync pipeline (TeacherInvitation.
 *    resendMessageId / deliveryStatus / open+click tracking) depends on.
 *  - Resend needs NO change to the existing root SPF record: its
 *    return-path lives on the `send.<domain>` SUBdomain and the DKIM key
 *    on `resend._domainkey.<domain>`. The root SPF
 *    (`v=spf1 include:sendgrid.net include:emailsrvr.com ~all`) and the
 *    Jimdo MX records stay untouched → no SPF permerror.
 *
 * Env overrides (settable in wrangler vars, no rebuild of the mapping):
 *   EMAIL_FROM_DEVOIRAT       → "contact@devoirat.net"
 *   EMAIL_FROM_TUNISIECOLLEGE → "contact@tunisiecollege.net"
 *   EMAIL_FROM                → fallback sender (default examanet)
 */

import type { SourceSite } from './email-templates/jotform-invitation';

export type { SourceSite };

export const SITE_SENDER_DEFAULTS: Record<SourceSite, string> = {
  devoirat: 'contact@devoirat.net',
  tunisiecollege: 'contact@tunisiecollege.net',
};

/** Used when a site sender is missing or the send fails. */
export const EXAMANET_SENDER_FALLBACK = 'Examanet <noreply@examanet.com>';

const ENV_KEYS: Record<SourceSite, string> = {
  devoirat: 'EMAIL_FROM_DEVOIRAT',
  tunisiecollege: 'EMAIL_FROM_TUNISIECOLLEGE',
};

/**
 * Read a worker env var the CF-safe way.
 * Inside Cloudflare Workers `process.env` is NOT populated with secrets,
 * so the CF context binding is the source of truth. `process.env` is kept
 * as a fallback for `next dev` / local node runs.
 */
async function readEnv(key: string): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const v = (ctx as any)?.env?.[key];
    if (v) return String(v);
  } catch {
    // no CF context (local dev / test)
  }
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return String(process.env[key]);
  }
  return undefined;
}

/**
 * Resolve the From address for a given source site.
 * Returns the site sender plus the examanet fallback (used if the site
 * sender fails — e.g. the domain is not yet verified in Resend, so the
 * invitation would otherwise be lost).
 */
export async function getSiteSender(
  site: SourceSite,
): Promise<{ from: string; fallback: string; usedDefault: boolean }> {
  const envKey = ENV_KEYS[site];
  const envValue = await readEnv(envKey);
  const from = envValue || SITE_SENDER_DEFAULTS[site];
  const fallback = (await readEnv('EMAIL_FROM')) || EXAMANET_SENDER_FALLBACK;
  return { from, fallback, usedDefault: !envValue };
}

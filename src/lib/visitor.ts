/**
 * Get real visitor IP from request headers.
 * Returns '0.0.0.0' as fallback if no IP can be determined
 * (which is NEVER the same as hardcoded placeholders like 'visitor' or 'viewer').
 */

import { headers } from 'next/headers';

/**
 * Server Component version — uses next/headers.
 */
export function getVisitorIp(): string {
  try {
    const h = headers();
    // Vercel + Cloudflare + most proxies
    const cf = h.get('cf-connecting-ip');
    if (cf) return cf.trim();

    const real = h.get('x-real-ip');
    if (real) return real.trim();

    const fwd = h.get('x-forwarded-for');
    if (fwd) {
      // First IP in the chain is the client
      const first = fwd.split(',')[0]?.trim();
      if (first) return first;
    }

    return '0.0.0.0';
  } catch {
    return '0.0.0.0';
  }
}

/**
 * API Route version — accepts a Request object.
 */
export function getVisitorIpFromRequest(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();

  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }

  return '0.0.0.0';
}

/**
 * Bot/placeholder IP detection — used to skip tracking for known dev/internal IPs.
 */
const PLACEHOLDER_IPS = new Set([
  'visitor',
  'viewer',
  'download',
  'unknown',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '',
]);

const BOT_UA_PATTERNS = [
  /bot/i,
  /spider/i,
  /crawler/i,
  /curl\//i,
  /wget/i,
  /python-requests/i,
  /node-fetch/i,
  /scrapy/i,
  /httpclient/i,
  /headlesschrome/i,
  /phantomjs/i,
];

export function isBotOrPlaceholder(ip: string | null | undefined, ua?: string | null): boolean {
  if (!ip) return true;
  if (PLACEHOLDER_IPS.has(ip.toLowerCase())) return true;
  if (ua && BOT_UA_PATTERNS.some((p) => p.test(ua))) return true;
  return false;
}

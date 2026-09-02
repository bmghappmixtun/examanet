/**
 * Security helpers - shared across the platform
 */

/**
 * Check if we're in production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Guard a route to be only available in dev/test mode
 * Returns a 404 response in production, null otherwise
 */
export function notInProductionResponse() {
  if (isProduction()) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}

/**
 * Sanitize HTML content to prevent XSS
 * Strips all HTML tags except a whitelist of safe ones
 */
export function sanitizeHtml(html: string, allowedTags: string[] = []): string {
  if (!html) return '';
  // Escape angle brackets
  let sanitized = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // If allowed tags, restore them
  for (const tag of allowedTags) {
    const openTag = new RegExp(`&lt;${tag}(?:\\s[^&]*?)?&gt;`, 'gi');
    const closeTag = new RegExp(`&lt;/${tag}&gt;`, 'gi');
    sanitized = sanitized.replace(openTag, (m) => m.replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    sanitized = sanitized.replace(closeTag, `</${tag}>`);
  }
  return sanitized;
}

/**
 * Sanitize highlight HTML (from search) - just escape HTML but preserve <mark>
 */
export function sanitizeHighlightHtml(html: string): string {
  if (!html) return '';
  // Only allow <mark> and </mark> tags
  return sanitizeHtml(html, ['mark']);
}

/**
 * Validate origin for CSRF protection on state-changing requests
 * Returns true if the request origin matches our site
 */
export function isValidOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  if (!origin && !referer) {
    // No origin = likely server-side or curl, allow in dev
    if (!isProduction()) return true;
    return false;
  }

  const allowedHosts = [
    'examanet.com',
    'www.examanet.com',
    'localhost',
    '127.0.0.1',
  ];

  // Workers.dev subdomains (any sub: examanet-poc, examanet-prod, etc.)
  // The wildcard check below handles all of them.
  // Production host validation: origin hostname must equal the request's host,
  // OR end with one of the allowedHosts (handles subdomains).
  // This way, requests to workers.dev URLs work without listing each one.

  const checkUrl = origin || referer || '';
  try {
    const url = new URL(checkUrl);
    // Same host as request = OK (covers workers.dev POC/PROD)
    if (host && url.hostname === host) return true;
    // workers.dev subdomains (any *.workers.dev) = OK
    if (url.hostname === 'workers.dev' || url.hostname.endsWith('.workers.dev')) return true;
    // Allowed hosts
    return allowedHosts.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

/**
 * Extract client IP from various headers (Vercel, Cloudflare, etc.)
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    headers.get('x-vercel-forwarded-for') ||
    'unknown'
  );
}

/**
 * Simple in-memory rate limiter (per-IP, per-endpoint, time window)
 * For more serious production use, replace with Redis/Upstash
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  identifier: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetIn: number } {
  const key = `${endpoint}:${identifier}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Cleanup expired entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [k, v] of rateLimitStore) {
      if (v.resetAt < now) rateLimitStore.delete(k);
    }
  }

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now };
}

/**
 * Validate that a string is a valid Tunisian phone number (8 digits)
 */
export function isValidTunisianPhone(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-\+\(\)]/g, '');
  return /^(\+216|216)?[2-9]\d{7}$/.test(cleaned);
}

/**
 * Mask an email for safe display (e.g. in logs)
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

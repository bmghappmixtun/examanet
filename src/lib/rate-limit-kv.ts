// @ts-nocheck
/**
 * Rate limiter using Cloudflare KV (APP_CACHE) when available,
 * falling back to in-memory on Vercel/serverless.
 *
 * Strategy: Token bucket per IP per endpoint, with configurable
 * max requests and window. When limit exceeded, returns 429
 * with Retry-After header.
 *
 * 2026-09-07: Created in response to bot traffic spike on /api/search/*.
 * - /fr/recherche got 7,448 visitors in 7 days, 99.93% desktop bots
 * - Each search hit Prisma + Neon connection pool → 6,737 errors in 5 days
 * - Rate limit 30 req/min per IP for search endpoints
 *
 * CF Workers: uses APP_CACHE KV with TTL = window
 * Vercel: in-memory Map (per-instance, not shared)
 *
 * For global rate limiting on Vercel, would need Vercel KV (paid).
 */

import { getClientIp } from './security';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // ms
  limit: number;
  reason?: string;
}

const memoryStore = new Map<string, { count: number; resetAt: number; lastUa?: string }>();

/**
 * Rate limit a request by IP for a specific endpoint.
 * 
 * @param request - The incoming request
 * @param endpoint - Endpoint name (used as key namespace)
 * @param maxRequests - Max requests per window
 * @param windowMs - Window size in ms
 * @param options - Optional: { ua, action } - 'allow' or 'block' with UA logging
 */
export async function rateLimitKv(
  request: Request,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
  options?: { logBlocked?: boolean }
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent') || 'unknown';
  const key = `ratelimit:${endpoint}:${ip}`;
  const now = Date.now();

  // Try CF KV first (persistent, works across instances)
  let kv = null;
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    kv = (ctx as any).env?.APP_CACHE;
  } catch (e) {
    // Not on CF, use in-memory
  }

  if (kv) {
    // CF KV path
    let entry: { count: number; resetAt: number } | null = null;
    try {
      const raw = await kv.get(key);
      if (raw) entry = JSON.parse(raw);
    } catch (e) {
      // ignore
    }

    if (!entry || entry.resetAt < now) {
      // New window
      entry = { count: 1, resetAt: now + windowMs };
      try {
        await kv.put(key, JSON.stringify(entry), { expirationTtl: Math.ceil(windowMs / 1000) });
      } catch (e) {
        // ignore
      }
      return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs, limit: maxRequests };
    }

    if (entry.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: entry.resetAt - now,
        limit: maxRequests,
        reason: 'rate_limit_exceeded',
      };
    }

    entry.count++;
    try {
      await kv.put(key, JSON.stringify(entry), { expirationTtl: Math.ceil((entry.resetAt - now) / 1000) });
    } catch (e) {
      // ignore
    }
    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetIn: entry.resetAt - now,
      limit: maxRequests,
    };
  }

  // In-memory fallback (Vercel serverless)
  if (memoryStore.size > 10000) {
    for (const [k, v] of memoryStore) {
      if (v.resetAt < now) memoryStore.delete(k);
    }
  }

  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs, lastUa: ua });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs, limit: maxRequests };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetAt - now,
      limit: maxRequests,
      reason: 'rate_limit_exceeded',
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetIn: entry.resetAt - now,
    limit: maxRequests,
  };
}

/**
 * Helper to return a 429 NextResponse with proper headers.
 */
export function rateLimitResponse(result: RateLimitResult) {
  const headers = new Headers();
  headers.set('Retry-After', String(Math.ceil(result.resetIn / 1000)));
  headers.set('X-RateLimit-Limit', String(result.limit));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + result.resetIn) / 1000)));
  
  return new Response(
    JSON.stringify({
      error: 'rate_limit_exceeded',
      message: `Trop de requêtes. Réessayez dans ${Math.ceil(result.resetIn / 1000)} secondes.`,
      retryAfter: Math.ceil(result.resetIn / 1000),
    }),
    {
      status: 429,
      headers: { ...Object.fromEntries(headers), 'Content-Type': 'application/json' },
    }
  );
}

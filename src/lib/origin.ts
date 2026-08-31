import { NextRequest } from 'next/server';

/**
 * Build an absolute URL relative to the incoming request's origin.
 * Always uses the request's URL — works in dev, in production on CF Workers,
 * and doesn't depend on Vercel-specific env vars.
 *
 * Falls back to NEXT_PUBLIC_SITE_URL (build-time constant) or NEXTAUTH_URL
 * if the request URL can't be parsed. Localhost is the final fallback.
 */
export function getRequestOrigin(req: NextRequest): string {
  try {
    return new URL(req.url).origin;
  } catch {
    // ignore — fall through
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  return 'http://localhost:3000';
}

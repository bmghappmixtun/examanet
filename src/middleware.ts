import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';

/**
 * Next-intl middleware.
 *
 * Responsibilities:
 * - Detect locale from URL prefix, cookie, or Accept-Language
 * - Redirect bare URLs (e.g. /matieres) to /fr/matieres (default locale)
 * - Strip /ar/* to locale-internal routing (handled by [locale] segment)
 * - Set NEXT_LOCALE cookie for persistence (only on redirect)
 *
 * PERF 2026-09-02 (Step 6): For URLs that ALREADY have a locale prefix
 * (e.g. /fr/ressources, /ar/niveaux), the cookie is redundant (the URL
 * is canonical). We strip Set-Cookie from the response so CF can cache
 * the page at the edge.
 *
 * The matcher excludes:
 * - /api/* (API routes don't need locale)
 * - /_next/* (Next.js internals)
 * - Files with extensions (favicon.ico, robots.txt, etc.)
 * - /admin, /enseignant, /connexion, /mon-compte, etc. (NOT localized - admin & auth pages stay FR only)
 */
const intlMiddleware = createMiddleware(routing);

const LOCALE_PREFIXES = routing.locales.map((l) => `/${l}/`);

export default async function middleware(request: NextRequest) {
  const response = await intlMiddleware(request);

  // PERF 2026-09-02: If the URL already has a locale prefix, the Set-Cookie
  // header is redundant (the URL itself is the source of truth for locale).
  // CF won't cache responses with Set-Cookie, so we strip it.
  const path = request.nextUrl.pathname;
  const hasLocalePrefix = LOCALE_PREFIXES.some((p) => path.startsWith(p)) || path === '/fr' || path === '/ar';

  if (hasLocalePrefix) {
    // Delete the Set-Cookie header so the response can be cached
    response.headers.delete('set-cookie');
  }

  return response;
}

export const config = {
  matcher: [
    // Match all pathnames EXCEPT:
    // - /api/*, /_next/*, /_vercel/* (internals)
    // - Files with extensions (favicon.ico, robots.txt, etc.)
    // - Admin/auth pages that are NOT localized
    '/((?!api|_next|_vercel|admin|enseignant|connexion|inscription|en-attente|messages|verifier|invitation|mon-compte|mot-de-passe-oublie|.*\\..*).*)',
  ],
};

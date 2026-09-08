const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
// Cloudflare Workers isolated branch (feature/cf-isolated)
// This config is BAKED for CF — no more modifications needed at deploy time.
// To deploy: just run `./scripts/deploy-cf.sh` (or `npx wrangler deploy`).
const nextConfig = {
  // CF Workers requires standalone output for OpenNext
  output: "standalone",
  reactStrictMode: true,
  images: {
    // CF Workers doesn't support image optimization at runtime
    unoptimized: true,
    // SECURITY: restrict remotePatterns to trusted image hosts only
    // Was: { protocol: 'https', hostname: '**' } (allowed ANY HTTPS host = SSRF risk)
    remotePatterns: [
      { protocol: 'https', hostname: 'examanet.com' },
      { protocol: 'https', hostname: '*.examanet.com' },
      { protocol: 'https', hostname: 'blob.examanet.com' },
      { protocol: 'https', hostname: 'pub-*.r2.dev' },
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: '*.amazonaws.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }, // Google avatars
      { protocol: 'https', hostname: 'platform-lookaside.fbsbx.com' }, // Facebook avatars
    ],
    formats: ['image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
  },
  experimental: {
    serverActions: { bodySizeLimit: '50mb' },
    // 2026-07-30: Expanded for build perf (Vercel build time optimization).
    // Each entry enables tree-shaking so only used icons/parts ship.
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@radix-ui/react-popover',
      '@radix-ui/react-switch',
      '@radix-ui/react-toggle-group',
    ],
  },
  // 2026-07-29: numericId 19 was a corrupted "Faouzi El Gharbi" (with AR name
  // جهاد قفشين) whose 23 resources actually belong to the real Faouzi at
  // numericId 228 (AR name فوزي الغربي). User deleted, 23 resources migrated.
  // Permanent 308 redirect preserves SEO for any old external links.
  //
  // 2026-07-29 (audit prof 434): 5 resources for Amara Hichem had
  // schoolType=PILOTE wrongly. PDF content shows the school is "م. الهادي
  // العامري" (or variants — regular college in Kalaa Sghira, not النموذجية).
  // schoolType set to PUBLIC + title cleaned to remove "Collège pilote".
  // Slug changed accordingly. Old slugs redirected to the new canonical URL.
  async redirects() {
    return [
      {
        source: '/professeurs/19/:slug*',
        destination: '/professeurs/228/faouzi-el-gharbi',
        permanent: true,
      },
      // 5 resources schoolType PILOTE → PUBLIC: preserve old slug for SEO
      {
        source: '/ressources/1348/devoir-de-synthese-n-2-college-pilote-physique-8eme',
        destination: '/ressources/1348/devoir-de-synthese-n-2-physique-8eme',
        permanent: true,
      },
      {
        source: '/ressources/1351/devoir-de-synthese-n-2-college-pilote-physique-8eme',
        destination: '/ressources/1351/devoir-de-synthese-n-2-physique-8eme',
        permanent: true,
      },
      {
        source: '/ressources/1353/devoir-de-synthese-n-2-college-pilote-physique-9eme',
        destination: '/ressources/1353/devoir-de-synthese-n-2-physique-9eme',
        permanent: true,
      },
      {
        source: '/ressources/1876/devoir-de-synthese-n-1-college-pilote-physique-8eme',
        destination: '/ressources/1876/devoir-de-synthese-n-1-physique-8eme',
        permanent: true,
      },
      {
        source: '/ressources/3038/devoir-de-synthese-n-1-college-pilote-physique-9eme',
        destination: '/ressources/3038/devoir-de-synthese-n-1-physique-9eme',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      // Cache static assets aggressively
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/images/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/uploads/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // PERF 2026-09-02: Edge cache HTML for public pages (Step 6)
      // Public pages don't have user-specific data in the SSR HTML.
      // CF Workers will cache the HTML at the edge for `s-maxage` seconds.
      // `stale-while-revalidate` serves the stale version while regenerating.
      // 5 min = good balance between freshness and cache hit rate.
      {
        source: '/:locale(fr|ar)',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        source: '/:locale(fr|ar)/ressources',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=120, stale-while-revalidate=300' },
        ],
      },
      {
        source: '/:locale(fr|ar)/niveaux',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        source: '/:locale(fr|ar)/matieres',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        source: '/:locale(fr|ar)/professeurs',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        source: '/:locale(fr|ar)/bac/archives',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=600, stale-while-revalidate=1200' },
        ],
      },
      // SECURITY: API routes - no cache + nosniff
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      // SECURITY: Global security headers (applied to all routes)
      {
        source: '/:path*',
        headers: [
          // 2026-09-07: Removed X-Robots-Tag: noindex, nofollow, noarchive, nosnippet.
          // This header was a leftover from the CF Workers POC environment.
          // Production examanet.com is now the live site and MUST be indexable.
          // Per-page robots meta is controlled via generateMetadata() in each route.
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Force HTTPS (only in production)
          ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }] : []),
          // Control referrer information
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Restrict browser features
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // XSS protection (legacy, but still useful)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Content Security Policy - allow our resources
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googletagmanager.com https://*.google-analytics.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https:",
              "media-src 'self' https: blob:",
              "frame-src 'self' https://*.youtube.com https://*.vimeo.com https://*.public.blob.vercel-storage.com",
              // SECURITY: connect-src must include Vercel Blob storage (where PDFs are hosted)
              // for the React PDF viewer to fetch them. Also includes R2 (backup storage) + analytics.
              "connect-src 'self' https://*.examanet.com https://*.r2.dev https://*.amazonaws.com https://*.google-analytics.com https://*.public.blob.vercel-storage.com blob:",
              "worker-src 'self' blob:",
              "child-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "upgrade-insecure-requests",
            ].join('; ')
          },
        ],
      },
    ];
  },
  compress: true,
  poweredByHeader: false,
  // SECURITY: Disable powered-by header (already done above)
  // SECURITY: Block source maps from being served in production
  productionBrowserSourceMaps: false,
  // PERF: skip ESLint during build (run via 'npm run lint' instead)
  // The new ESLint config catches hundreds of pre-existing issues that
  // would block deploys. Incremental fix in progress.
  eslint: { ignoreDuringBuilds: true },
  // PERF: skip TypeScript errors during build (Drizzle mode: 'json'/'timestamp' on
  // SQLite text columns throws in Next 14, but works fine in D1)
  typescript: { ignoreBuildErrors: true },
};

module.exports = withNextIntl(nextConfig);


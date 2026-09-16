import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import ServiceWorkerRegister from '@/components/pwa/ServiceWorkerRegister';
import ErrorHandlerInit from '@/components/errors/ErrorHandlerInit';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { NextIntlClientProvider } from 'next-intl';
import { organizationSchema } from '@/lib/structured-data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

// PERF: Self-host Google Fonts via next/font — eliminates the render-blocking
// external CSS request to fonts.googleapis.com (was ~150ms TTFB on cold visits,
// especially on 3G networks in Tunisia). Also: subset to latin + latin-ext
// + arabic to avoid downloading unused glyphs (~30% smaller).

// Fustat: used for ARABIC TITLES and AI SUMMARIES (selected 2026-07-28 after
// /font-test comparison). Self-hosted from Google Fonts (not in next/font/google).
// 3 .woff2 files (arabic / latin-ext / latin) downloaded into src/fonts/fustat/.
const fustat = localFont({
  src: [
    { path: '../fonts/fustat/fustat-arabic.woff2', weight: '400 800', style: 'normal' },
    { path: '../fonts/fustat/fustat-latin-ext.woff2', weight: '400 800', style: 'normal' },
    { path: '../fonts/fustat/fustat-latin.woff2', weight: '400 800', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-fustat',
  preload: true,
});

// SEO: per-locale default metadata. The template is added per-locale so
// children pages never need to worry about i18n.
const LOCALE_DEFAULTS = {
  fr: {
    // SEO 2026-08-22: trimmed root title to 47 chars (was 53) so child
    // page titles like "Bac Tunisie 2025 | Examanet" (56 chars) fit in
    // Google's 60-char SERP limit.
    title: 'Examanet — Plateforme pédagogique tunisienne',
    description:
      'Cours, devoirs, exercices, sujets de bac et corrigés pour le Primaire, Collège et Lycée en Tunisie. Gratuit.',
    ogTitle: 'Examanet — Plateforme pédagogique tunisienne',
    ogDescription:
      'Cours, devoirs, exercices, sujets de bac et corrigés pour le Primaire, Collège et Lycée en Tunisie. Gratuit.',
    twitterTitle: 'Examanet — Plateforme pédagogique tunisienne',
    twitterDescription:
      'Cours, devoirs, exercices, sujets de bac et corrigés pour le Primaire, Collège et Lycée en Tunisie. Gratuit.',
  },
  ar: {
    title: 'إكسامانت — المنصة التربوية #1 في تونس',
    description:
      'دروس، فروض، سلاسل، ملخصات، مواضيع باكالوريا وإصلاحات — مجانية 100% لتلاميذ الابتدائي، الإعدادي والثانوي في تونس.',
    ogTitle: 'إكسامانت — المنصة التربوية #1 في تونس',
    ogDescription: 'دروس، فروض، ملخصات، مواضيع باك وإصلاحات — مجانية 100% للتلاميذ التونسيين.',
    twitterTitle: 'إكسامانت — المنصة التربوية #1 في تونس',
    twitterDescription: 'دروس، فروض، ملخصات، مواضيع باك وإصلاحات — مجانية 100%.',
  },
} as const;

// Function-based metadata so it can read the locale at request time
// (the previous static `export const metadata` always used FR).
// PERF 2026-08-16: removed the `await headers()` call. The previous version
// read the locale from the middleware header on every request, which forced
// the entire site (every page through this root layout) into dynamic mode
// and bypassed ISR. The root metadata is now the FR default; per-locale
// overrides live in `app/[locale]/layout.tsx` and use `params.locale`
// (no headers needed → static at build time per-locale).
export function generateMetadata(): Metadata {
  const t = LOCALE_DEFAULTS.fr;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t.title,
      // SEO 2026-08-22: changed " — Examanet" → " | Examanet" so the title
      // reads "X | Examanet" instead of "Examanet — X — Examanet" (the brand
      // was appearing twice when page titles started with "Examanet — X").
      template: '%s | Examanet',
    },
    description: t.description,
    keywords: [
      'examanet',
      'éducation tunisie',
      'cours',
      'devoirs',
      'bac',
      'collège',
      'lycée',
      'primaire',
      'exercices',
      'révisions',
    ],
    authors: [{ name: 'Examanet' }],
    creator: 'Examanet',
    publisher: 'Examanet',
    applicationName: 'Examanet',
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
        { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
        { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    manifest: '/manifest.json',
    openGraph: {
      type: 'website',
      locale: 'fr_TN',
      url: SITE_URL,
      siteName: 'Examanet',
      title: t.ogTitle,
      description: t.ogDescription,
      images: [
        {
          url: '/api/og/page/home',
          width: 1200,
          height: 630,
          alt: 'Examanet - Plateforme pédagogique tunisienne',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.twitterTitle,
      description: t.twitterDescription,
      images: ['/api/og/page/home'],
      creator: '@examanet',
    },
    // 2026-09-07: Allow full indexing on production (examanet.com).
    // The previous noindex/nofollow was a leftover from the CF Workers POC.
    // The matching X-Robots-Tag header in next.config.js was also removed.
    // Pages that should NOT be indexed (admin, /connexion, /mon-compte,
    // /enseignant, /recherche) override this in their own generateMetadata().
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    // SEO 2026-08-22: the canonical on the ROOT layout is the bare site URL
    // (this is the homepage canonical). For [locale]/* pages, the locale
    // layout's generateMetadata() OVERRIDES this with a locale-prefixed
    // canonical + proper hreflang alternates. This is correct Next.js
    // behavior — child metadata wins.
    alternates: {
      canonical: SITE_URL,
      languages: {
        'fr-TN': SITE_URL,
        'ar-TN': `${SITE_URL}/ar`,
        'x-default': SITE_URL,
      },
    },
    other: {
      'theme-color': '#0EA5E9',
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'default',
      'apple-mobile-web-app-title': 'Examanet',
      'mobile-web-app-capable': 'yes',
      'format-detection': 'telephone=no',
      'google-site-verification': 'GXE5A9gq9-K7q7IztCatkSHhYrgtWWBbPloJymofPUY',
      'msvalidate.01': 'C04AC04227DB04DAC96552F4A27BCD73',
    },
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 3,
  themeColor: '#0EA5E9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // PERF 2026-08-16: removed `await headers()` and the locale-driven `lang`/
  // `dir` interpolation. The previous version read the locale from middleware
  // headers on every request, which forced the ENTIRE site (every page
  // through this root layout) into dynamic mode and bypassed ISR.
  //
  // The locale-specific <html lang>/<html dir> for [locale]/* pages is now
  // applied client-side by `SyncLocaleAttrs` (mounted in
  // `app/[locale]/layout.tsx`) which runs synchronously before paint.
  // For non-localized routes (/admin, /connexion, /api/*) FR defaults are
  // correct (these pages have no Arabic variant).
  return (
    <html
      lang="fr"
      dir="ltr"
      className={fustat.variable}
      suppressHydrationWarning
    >
      <head>
        {/* Explicit Google site verification meta tag (HTML tag verification) */}
        <meta
          name="google-site-verification"
          content="GXE5A9gq9-K7q7IztCatkSHhYrgtWWBbPloJymofPUY"
        />
        {/* Bing Webmaster Tools verification meta tag (HTML tag verification) */}
        <meta name="msvalidate.01" content="C04AC04227DB04DAC96552F4A27BCD73" />
        {/* OpenGraph locale: hardcoded FR (locale override happens in [locale]/layout for /ar) */}
        <meta property="og:locale" content="fr_TN" />
        {/* Twitter locale for AR */}
        <meta name="twitter:card" content="summary_large_image" />
        {/* Hreflang: FR is canonical, AR is at /ar/* prefix, x-default points to FR. */}
        <link rel="alternate" hrefLang="fr-TN" href={SITE_URL} />
        <link rel="alternate" hrefLang="ar-TN" href={`${SITE_URL}/ar`} />
        <link rel="alternate" hrefLang="x-default" href={SITE_URL} />
        {/* 2026-07-30: preconnect to Vercel Blob storage (PDFs) so the TCP
            + TLS handshake happens in parallel with HTML/CSS/JS parsing.
            Saves ~100-200ms on first PDF download / preview thumbnail. */}
        
        {/* 2026-07-30: preconnect to Google Analytics to avoid late DNS/TLS
            on first interaction (improves INP by ~30-50ms). */}
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        {/* PERF 2026-08-16: removed `messages={await getMessages()}`. The
            root layout now provides the NextIntlClientProvider with just
            the default FR locale — no async call needed. Localized pages
            under [locale]/ are wrapped in their own NextIntlClientProvider
            (in app/[locale]/layout.tsx) with the proper per-locale messages,
            which overrides this one. Non-localized pages (/admin,
            /connexion, /api/*) get the default FR messages statically. */}
        <NextIntlClientProvider locale="fr">
        <NuqsAdapter>
          {children}
        </NuqsAdapter>
        </NextIntlClientProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { borderRadius: '12px', background: '#0F172A', color: '#fff' },
          }}
        />
        {/* Organization + WebSite + SearchAction JSON-LD — enables Google knowledge panel + sitelinks searchbox */}
        {organizationSchema().map((schema, i) => (
          <script
            key={`org-schema-${i}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
        <ServiceWorkerRegister />
        <ErrorHandlerInit />
      </body>
    </html>
  );
}
// Sat Jul 18 11:28:48 UTC 2026
// Force rebuild for CF cache

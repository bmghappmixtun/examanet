import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { hasLocale } from 'next-intl';
import { unstable_cache as nextCache } from 'next/cache';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import SyncLocaleAttrs from '@/components/i18n/SyncLocaleAttrs';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

// SEO 2026-08-22: per-locale default metadata. This is the FALLBACK for any
// page under [locale]/ that doesn't define its own generateMetadata — it
// ensures every page gets:
// - Locale-prefixed canonical (so /fr/ressources ≠ /ar/ressources ≠ /)
// - Locale-correct og:locale (fr_TN vs ar_TN)
// - Hreflang alternates pointing to both FR and AR versions
// - A descriptive title and description in the right language
const LOCALE_META = {
  fr: {
    title: 'Examanet — La plateforme pédagogique #1 en Tunisie',
    description:
      'Plateforme pédagogique tunisienne #1 : cours, devoirs, exercices, sujets de bac et corrigés pour le Primaire, Collège et Lycée. 100% gratuit.',
    ogLocale: 'fr_TN' as const,
  },
  ar: {
    title: 'إكسامانت — المنصة التربوية #1 في تونس',
    description:
      'المنصة التربوية التونسية #1: دروس، فروض، تمارين، سلاسل، ملخصات، مواضيع باكالوريا وإصلاحات للابتدائي، الإعدادي والثانوي. مجانية 100%.',
    ogLocale: 'ar_TN' as const,
  },
} as const;

// PERF 2026-08-16: cache getMessages() per locale. Without this, every page
// in [locale]/ triggers a new messages fetch → dynamic rendering → bypasses
// the Vercel CDN cache (cache-control: private, no-cache, no-store).
// With the cache, getMessages is static per locale and the layout can be
// pre-rendered, enabling ISR for every page under [locale]/.
const getCachedMessages = nextCache(
  async (locale: string) => {
    const result = await getMessages();
    return result as any;
  },
  ['i18n-messages-v1'],
  { revalidate: 3600, tags: ['i18n'] },
);

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Per-locale metadata fallback.
 *
 * SEO 2026-08-22: This fixes the audit findings that every [locale] page was
 * inheriting the root layout's FR metadata (canonical: SITE_URL, og:locale: fr_TN,
 * no hreflang). With this in place:
 * - The /ar home page now has og:locale=ar_TN, AR description, and hreflang
 *   alternates pointing to /fr and /ar variants
 * - Child page-level generateMetadata() can STILL override canonical/og:url
 *   for their own URL — this only sets the per-locale defaults
 *
 * The root layout's `template: '%s — Examanet'` is overridden here so each
 * locale gets a properly-translated brand suffix (no more "Examanet" hard-coded).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }

  const t = LOCALE_META[locale as keyof typeof LOCALE_META];

  return {
    title: {
      default: t.title,
      template: locale === 'ar' ? '%s | إكسامانت' : '%s | Examanet',
    },
    description: t.description,
    alternates: {
      languages: {
        'fr-TN': `${SITE_URL}/fr`,
        'ar-TN': `${SITE_URL}/ar`,
        'x-default': `${SITE_URL}/fr`,
      },
    },
    openGraph: {
      locale: t.ogLocale,
      siteName: locale === 'ar' ? 'إكسامانت' : 'Examanet',
    },
  };
}

/**
 * Locale layout for [locale] segment.
 *
 * - NextIntlClientProvider injects messages into the client tree
 * - Header/Footer wrap the page content
 * - No more I18nProvider (old custom system) — that was the source of
 *   "content in AR but URL is /fr" bug because it overrode the locale
 *   based on localStorage
 *
 * NOTE: Fonts (Inter, Noto_Sans_Arabic) and <html>/<body> are owned by
 * the root app/layout.tsx. Returning a fragment here is the Next.js
 * App Router invariant — see fix comment in the component body below
 * for the full rationale.
 */
export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getCachedMessages(locale);

  // 2026-08-15 nightly fix (ERR-K2N98N/SMRMP8/F6RCN5/2PR9XS/7FH8HK/6KDXHZ/
  //   YGXCC9/DXD4MM/RGHJEC — 78 hydration errors / 7 days):
  //
  // PREVIOUSLY this layout returned its own <html><body> nested inside the
  // root app/layout.tsx <html><body>. That violates the Next.js App Router
  // invariant: "the root layout MUST be the only one with <html>/<body>",
  // and produces a real DOM with TWO <html> + TWO <body> elements. The
  // browser's HTML parser silently drops the inner ones (so the visible
  // page only has the outer), but React's hydration walker follows the
  // rendered HTML stream byte-by-byte and finds the inner ones too.
  //
  // The mismatch between the React tree (which DOES include the inner
  // <html>/<body>) and the actual DOM (which only has the outer ones)
  // caused three different error classes, all on pages that hydrate
  // through this layout:
  //   - React #418 ("Hydration failed"): 32+32+8+8 hits on resource,
  //     concours, and programme-officiel pages (the first SSR pass of
  //     the children renders one tree, the streaming pass renders a
  //     different one)
  //   - React #422 ("There was an error while hydrating"): same pattern
  //   - "t.parallelRoutes is null" (5 hits) on programme-officiel
  //     lycee tab + "insertBefore/removeChild not a child of this node"
  //     (5 hits) on /connexion after navigating from a [locale] page.
  //     The "t.parallelRoutes is null" error is Next.js failing to
  //     resolve the parallel route slot when the route segment's
  //     html/body structure changes between renders (locale vs
  //     non-locale pages), which happens exactly when the user
  //     crosses the [locale] route boundary.
  //
  // FIX: return just a fragment here. The root layout owns
  // <html><body> + the outermost <NextIntlClientProvider> (with the
  // locale read from the x-next-intl-locale header, which the
  // next-intl middleware sets on every request). This inner provider
  // overrides the outer one with the URL-resolved locale + the
  // getMessages() payload (the outer one only has the default-locale
  // fallback). SyncLocaleAttrs stays here so the <html> dir/lang stays
  // in sync after client-side locale switches (the next-intl router
  // mutates the URL but doesn't re-render the root layout).
  return (
    <>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <SyncLocaleAttrs />
        <Header />
        <main className="min-h-screen">
          {children}
        </main>
        <Footer />
      </NextIntlClientProvider>
    </>
  );
}

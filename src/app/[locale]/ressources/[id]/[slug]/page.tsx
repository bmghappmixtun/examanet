// @ts-nocheck
// 2026-08-27: Resource detail page — TRUE client-only shim.
//
// The server component does NOTHING but render a client component. This is
// the only way to avoid the getCloudflareContext() race condition in the
// OpenNext/Next.js render pipeline, which was causing 1101 errors.
//
// All data fetching happens client-side via /api/ressources/[id]/detail,
// which uses D1 directly (no getCloudflareContext in the render path).

import ResourceDetailClient from '@/components/resources/ResourceDetailClient';

export const dynamic = 'force-dynamic';

// 2026-09-12: Switched from static `metadata` to `generateMetadata` so we can
// include a locale-aware canonical. Without this, Google flagged 15,000+
// resource pages as "Autre page avec balise canonique correcte" because
// they had no canonical link tag at all.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string; slug: string }>;
}) {
  const { locale, id, slug } = await params;
  const numericId = parseInt(id, 10);
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const localePrefix = locale === 'ar' ? '/ar' : '/fr';
  const decodedSlug = (() => {
    try { return decodeURIComponent(slug); } catch { return slug; }
  })();
  return {
    title: 'Ressource pédagogique — Examanet',
    description:
      'Cours, exercices, sujets de bac et corrigés gratuits sur Examanet, la plateforme pédagogique tunisienne.',
    robots: { index: true, follow: true },
    alternates: {
      // Locale-aware canonical pointing to the actual page URL
      canonical: Number.isFinite(numericId) && numericId > 0
        ? `${SITE_URL}${localePrefix}/ressources/${numericId}/${decodedSlug}`
        : `${SITE_URL}${localePrefix}/ressources`,
    },
    openGraph: {
      title: 'Ressource pédagogique — Examanet',
      description: 'Cours et exercices gratuits sur Examanet',
      locale: locale === 'ar' ? 'ar_TN' : 'fr_TN',
      type: 'article',
    },
  };
}

export default function Page({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  return <ResourceDetailPageAsync params={params} />;
}

// Async wrapper to await params before passing to client component
async function ResourceDetailPageAsync({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Ressource non trouvée</h1>
        </div>
      </div>
    );
  }
  // Decode URL-encoded slugs (Arabic chars, etc.)
  let decodedSlug = slug;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    // Keep as-is if decode fails
  }
  return <ResourceDetailClient numericId={numericId} slug={decodedSlug} />;
}

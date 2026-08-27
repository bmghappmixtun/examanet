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

export const metadata = {
  title: 'Ressource pédagogique — Examanet',
  description:
    'Cours, exercices, sujets de bac et corrigés gratuits sur Examanet, la plateforme pédagogique tunisienne.',
  robots: { index: false, follow: false },
};

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

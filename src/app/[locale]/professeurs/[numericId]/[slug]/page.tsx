// @ts-nocheck
// 2026-08-28: /fr/professeurs/[numericId]/[slug] — TRUE client-only shim
// Server-side metadata for SEO + Client component for all data.

import TeacherDetailClient from '@/components/teachers/TeacherDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ numericId: string; slug: string }>;
}) {
  const { numericId: numericIdStr } = await params;
  const numericId = parseInt(numericIdStr, 10);
  
  // Default metadata for invalid IDs
  if (!numericIdStr || numericIdStr === 'undefined' || Number.isNaN(numericId) || numericId <= 0) {
    return { title: 'Professeur non trouvé' };
  }
  
  // Simple, fast metadata (no D1 calls in generateMetadata to avoid CPU timeout)
  // The actual teacher name and details are shown in the client component
  return {
    title: `Professeur #${numericId} — Examanet`,
    description: `Découvrez le profil de ce professeur sur Examanet : cours, exercices, sujets et corrigés gratuits.`,
    alternates: {
      canonical: `https://examanet.com/professeurs/${numericId}`,
    },
    openGraph: {
      title: `Professeur #${numericId} sur Examanet`,
      description: `Profil professeur sur Examanet`,
      url: `https://examanet.com/professeurs/${numericId}`,
      siteName: 'Examanet',
      locale: 'fr_TN',
      type: 'profile',
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ numericId: string; slug: string }>;
}) {
  // Await params on the server, then pass VALUES to client component
  // (cannot pass Promise/use() to client component - that fails during SSR)
  const { numericId, slug } = await params;
  return <TeacherDetailClient numericId={numericId} slug={slug} />;
}

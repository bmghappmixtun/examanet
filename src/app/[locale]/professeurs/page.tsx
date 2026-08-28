// @ts-nocheck
// 2026-08-28: /fr/professeurs — TRUE client-only shim.
// Server-side metadata for SEO, client-side data fetching via /api/professeurs/data.

import TeachersClient from '@/components/teachers/TeachersClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string; subject?: string }> }) {
  const sp = await searchParams;
  const filters: string[] = [];
  if (sp.q) filters.push(`"${sp.q}"`);
  if (sp.subject) filters.push(sp.subject);
  
  const baseTitle = 'Professeurs tunisiens — Enseignants certifiés';
  const title = filters.length > 0 ? `${filters.join(' · ')} — Professeurs` : baseTitle;
  
  return {
    title,
    description: 'Découvrez les professeurs tunisiens certifiés sur Examanet : cours, exercices, sujets de bac et corrigés. 100% gratuit.',
    alternates: {
      canonical: 'https://examanet.com/professeurs',
      languages: {
        'fr-TN': 'https://examanet.com/professeurs',
        'ar-TN': 'https://examanet.com/ar/professeurs',
      },
    },
    openGraph: {
      title: baseTitle,
      description: 'Professeurs tunisiens certifiés sur Examanet',
      url: 'https://examanet.com/professeurs',
      siteName: 'Examanet',
      locale: 'fr_TN',
      type: 'website',
    },
  };
}

export default function Page() {
  return <TeachersClient />;
}

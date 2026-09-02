// @ts-nocheck
// PERF 2026-09-02: 5min ISR cache for public page (Step 6)
export const revalidate = 300;
/**
 * /fr/matieres (list) — THIN SHELL
 *
 * Renders a client component that fetches data from /api/matieres/list.
 * This avoids the SSR crash on CF Workers (getCloudflareContext race
 * condition + D1 .all() pattern issues).
 */
import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import { itemListSchema } from '@/lib/structured-data';
import MatieresListClient from '@/components/matieres/MatieresListClient';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr
      ? 'جميع المواد — دروس، تمارين وإصلاحات'
      : 'Toutes les matières — Cours, exercices et corrigés',
    description: isAr
      ? 'جميع مواد البرنامج التونسي: الرياضيات، الفيزياء، علوم الحياة والأرض، الفرنسية، العربية، التاريخ، الفلسفة. دروس، تمارين وإصلاحات لكل مادة.'
      : 'Toutes les matières du programme tunisien : Maths, Physique, SVT, Français, Arabe, Histoire, Philosophie. Cours, exercices et corrigés par matière.',
    alternates: isAr ? { canonical: '/ar/matieres' } : { canonical: '/fr/matieres' },
    openGraph: {
      title: isAr ? 'جميع مواد البرنامج التونسي' : 'Toutes les matières du programme tunisien',
      description: isAr
        ? 'دروس، تمارين، مواضيع باك وإصلاحات لكل مادة من البرنامج الرسمي التونسي.'
        : 'Cours, exercices, sujets de bac et corrigés pour chaque matière du programme officiel tunisien.',
      url: isAr ? '/matieres' : '/matieres',
      type: 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
      images: [{ url: '/api/og/page/matieres', width: 1200, height: 630, alt: 'Examanet' }],
    },
  };
}

export default async function SubjectsPage() {
  const t = await getTranslations();
  const locale = await getLocale();

  // No SSR D1 query — the client component fetches the data.
  // This avoids the getCloudflareContext race condition on CF Workers.
  
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  // Provide a placeholder JSON-LD that the client can override if needed
  // (or just let the page render without it for simplicity)
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Toutes les matières — Examanet',
          description: 'Liste des matières du programme tunisien',
          url: `${baseUrl}/matieres`,
        }) }}
      />
      <MatieresListClient />
    </>
  );
}

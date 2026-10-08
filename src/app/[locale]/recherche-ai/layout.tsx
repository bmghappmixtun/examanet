// @ts-nocheck
/**
 * /fr/recherche-ai · metadata
 *
 * The page itself is a client component (uses localStorage / fetch),
 * so generateMetadata lives in this layout (server component).
 *
 * 2026-10-08: initial — powers the new AI semantic search.
 */

import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr ? 'بحث ذكي | إكسامانت' : 'Recherche IA | Examanet',
    description: isAr
      ? 'ابحث في 14 000+ مورد تربوي بالعربية أو الفرنسية. مدعوم بـ Cloudflare AI Search.'
      : 'Recherche sémantique dans 14 000+ ressources pédagogiques. FR / AR / darija. Propulsé par Cloudflare AI Search.',
    alternates: { canonical: isAr ? '/ar/recherche-ai' : '/fr/recherche-ai' },
    robots: { index: false, follow: true },
    openGraph: {
      title: isAr ? 'بحث ذكي' : 'Recherche IA',
      description: isAr
        ? 'ابحث في 14 000+ مورد تربوي.'
        : 'Recherche sémantique dans 14 000+ ressources.',
      type: 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
    },
  };
}

export default function RechercheAiLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

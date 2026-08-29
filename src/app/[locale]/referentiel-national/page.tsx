import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { breadcrumbSchema } from '@/lib/structured-data';
import { REFERENTIEL_SOURCE } from '@/data/referentiel-source';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

const breadcrumbJsonLd = breadcrumbSchema([
  { name: 'Accueil', url: SITE_URL },
  { name: 'Référentiel National', url: `${SITE_URL}/referentiel-national` },
]);

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr
      ? 'المرجع الوطني للمنظومة التربوية التونسية'
      : 'Référentiel National du Système Éducatif Tunisien',
    description: isAr
      ? '📘 المرجع الوطني الرسمي: المسار الكامل من السنة السابعة أساسي إلى الباكالوريا التونسية (الرائد الرسمي عدد 2019-1085).'
      : "📘 Référentiel national officiel : parcours complet de la 7ème année de base au Baccalauréat tunisien (JORT n° 2019-1085). Toutes les classes, sections et matières.",
    keywords: isAr
      ? ['référentiel national', 'système éducatif', 'tunisie']
      : ['référentiel national Tunisie', 'système éducatif tunisien', 'programme officiel', 'JORT 2019-1085'],
  };
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="pt-[62px] lg:pt-[73px]">
        <div
          id="referentiel-body"
          dangerouslySetInnerHTML={{ __html: REFERENTIEL_SOURCE }}
        />
      </div>
    </>
  );
}

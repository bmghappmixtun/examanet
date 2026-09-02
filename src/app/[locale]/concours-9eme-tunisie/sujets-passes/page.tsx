import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getConcoursStats, groupByYear } from '@/lib/concours-9eme-data';
import { itemListSchema, breadcrumbSchema, SITE_URL } from '@/lib/structured-data';
import { getTranslations, getLocale } from 'next-intl/server';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { ConcoursSujetsClient } from './client';

export const revalidate = 3600; // ISR: refresh every hour

const PAGE_PATH = '/concours-9eme-tunisie/sujets-passes';
const PAGE_URL_FR = `${SITE_URL}/fr${PAGE_PATH}`;
const PAGE_URL_AR = `${SITE_URL}/ar${PAGE_PATH}`;
const PARENT_URL = `${SITE_URL}/concours-9eme-tunisie`;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  const stats = getConcoursStats();
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const title = t('concours.passes.title')
    .replace('{highlight}', '')
    .replace('{total}', String(stats.totalFiles));
  const desc = `📥 ${stats.totalFiles} fichiers collectés depuis 2001 — filtre, recherche, téléchargement direct.`;
  return {
    title,
    description: desc,
    keywords:
      locale === 'ar'
        ? [
            'مواضيع التاسعة',
            'إصلاحات التاسعة تونس',
            'مناظرة التاسعة 2001',
            'مناظرة التاسعة 2024',
            'مناظرة التاسعة 2025',
            'مناظرة التاسعة 2026',
            'تحميل مواضيع التاسعة',
            'PDF مجاني تاسعة',
            'مناظرة التاسعة أساسي',
          ]
        : [
            'sujets 9ème année',
            'corrigés 9ème tunisie',
            'concours 9eme 2001',
            'concours 9eme 2024',
            'concours 9eme 2025',
            'concours 9eme 2026',
            'télécharger sujets 9eme',
            'PDF gratuit 9eme',
            'مناظرة التاسعة أساسي',
          ],
    alternates: {
      canonical: isAr ? PAGE_URL_AR : PAGE_URL_FR,
      languages: {
        'fr-TN': PAGE_URL_FR,
        'ar-TN': PAGE_URL_AR,
        'x-default': PAGE_URL_FR,
      },
    },
    openGraph: {
      title,
      description: desc,
      url: isAr ? PAGE_URL_AR : PAGE_URL_FR,
      siteName: 'Examanet',
      locale: locale === 'ar' ? 'ar_TN' : 'fr_TN',
      type: 'website',
    },
  };
}

interface PageProps {
  searchParams: { year?: string; subject?: string; voie?: string; type?: string; q?: string };
}

export default async function ConcoursSujetsPassesPage({ searchParams }: PageProps) {
  const t = await getTranslations();
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const stats = getConcoursStats();
  const yearGroups = groupByYear();

  const yearFilter = searchParams.year ? parseInt(searchParams.year, 10) : null;
  const subjectFilter = searchParams.subject || null;
  const voieFilter = searchParams.voie || null;
  const typeFilter = searchParams.type || null;
  const qFilter = (searchParams.q || '').toLowerCase();

  const filteredYears = yearGroups
    .map((yg) => {
      if (yearFilter && yg.year !== yearFilter) return null;
      const filteredVoies: typeof yg.voies = {};
      for (const [voie, subjects] of Object.entries(yg.voies)) {
        if (voieFilter && voie !== voieFilter) continue;
        const filteredSubjects: any = {};
        for (const [subject, files] of Object.entries(subjects)) {
          if (subjectFilter && subject !== subjectFilter) continue;
          const filtered: any = { ...files };
          if (typeFilter === 'sujet' && !files.sujet) delete filtered.sujet;
          if (typeFilter === 'corrige' && !files.corrige && !files.sujetPlusCorrige) {
            delete filtered.corrige;
            delete filtered.sujetPlusCorrige;
          }
          if (Object.keys(filtered).length === 0) continue;
          if (qFilter) {
            const searchStr =
              `${yg.year} ${subject} ${voie} ${Object.keys(filtered).join(' ')}`.toLowerCase();
            if (!searchStr.includes(qFilter)) continue;
          }
          filteredSubjects[subject] = filtered;
        }
        if (Object.keys(filteredSubjects).length > 0) {
          filteredVoies[voie] = filteredSubjects;
        }
      }
      if (Object.keys(filteredVoies).length === 0) return null;
      return { ...yg, voies: filteredVoies };
    })
    .filter((yg): yg is NonNullable<typeof yg> => yg !== null);

  const allFiles = stats.gold2020Corrige
    ? [
        stats.gold2020Corrige,
        ...filteredYears.flatMap((yg) =>
          Object.values(yg.voies).flatMap((s) =>
            Object.values(s).flatMap((f) =>
              [f.sujet, f.corrige, f.sujetPlusCorrige].filter(Boolean),
            ),
          ),
        ),
      ].slice(0, 50)
    : filteredYears
        .flatMap((yg) =>
          Object.values(yg.voies).flatMap((s) =>
            Object.values(s).flatMap((f) =>
              [f.sujet, f.corrige, f.sujetPlusCorrige].filter(Boolean),
            ),
          ),
        )
        .slice(0, 50);

  const itemListJsonLd = itemListSchema({
    name: t('concours.passes.title')
      .replace('{highlight}', '')
      .replace('{total}', String(stats.totalFiles)),
    description: `Liste complète des ${stats.totalFiles} sujets et corrigés du concours 9ème depuis 2001`,
    url: isAr ? PAGE_URL_AR : PAGE_URL_FR,
    items: allFiles.map((f: any) => ({
      name: f.key.split('/').slice(2).join('/'),
      url: f.url,
    })),
  });

  const breadcrumbJsonLd = breadcrumbSchema([
    { name: 'Accueil', url: SITE_URL },
    { name: 'Collège', url: `${SITE_URL}/college` },
    { name: 'Concours 9ème', url: PARENT_URL },
    { name: t('concours.breadcrumb.sujetsPasses'), url: isAr ? PAGE_URL_AR : PAGE_URL_FR },
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="flex-1 pt-20">
        {/* COMPACT HERO */}
        <section className="relative bg-gradient-to-br from-primary-50 via-white to-amber-50 py-8 lg:py-12 overflow-hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <nav
              aria-label="Fil d'Ariane"
              className="flex items-center gap-1 text-xs text-slate-500 mb-4 flex-wrap"
            >
              <Link href="/" className="hover:text-primary-600 transition">
                {t('nav.home') || 'Accueil'}
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <Link href="/college" className="hover:text-primary-600 transition">
                Collège
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <Link href="/concours-9eme-tunisie" className="hover:text-primary-600 transition">
                {t('concours.breadcrumb.concours9eme')}
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="text-slate-900 font-semibold">
                {t('concours.breadcrumb.sujetsPasses')}
              </span>
            </nav>

            <Link
              href="/concours-9eme-tunisie"
              className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-semibold mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> {t('concours.passes.backToPillar')}
            </Link>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight mb-2">
                  {(() => {
                    const title = t('concours.passes.title').replace(
                      '{total}',
                      String(stats.totalFiles),
                    );
                    const parts = title.split('{highlight}');
                    return (
                      <>
                        {parts[0]}
                        <span className="gradient-text">{parts[1] || ''}</span>
                      </>
                    );
                  })()}
                </h1>
                <p className="text-base lg:text-lg text-slate-600">
                  <strong>{stats.totalFiles} fichiers</strong> collectés depuis 2001 — filtre,
                  recherche, téléchargement.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="bg-white border border-slate-200 rounded-full px-3 py-1.5 font-semibold text-slate-700">
                  {t('concours.passes.statSujets').replace('{count}', String(stats.totalSujets))}
                </span>
                <span className="bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-3 py-1.5 font-semibold">
                  {t('concours.passes.statCorriges').replace(
                    '{count}',
                    String(stats.totalCorriges),
                  )}
                </span>
                {stats.totalCorriges2020Plus > 0 && (
                  <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1.5 font-semibold">
                    {t('concours.passes.statGold').replace(
                      '{count}',
                      String(stats.totalCorriges2020Plus),
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <ConcoursSujetsClient
          yearGroups={filteredYears}
          allYearGroups={yearGroups}
          totalFiles={stats.totalFiles}
        />
      </main>

      </div>
  );
}

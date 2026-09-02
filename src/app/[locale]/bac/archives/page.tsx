import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getBacStats, groupByYearForArchive } from '@/lib/bac-data';
import { itemListSchema, breadcrumbSchema, SITE_URL } from '@/lib/structured-data';
import { getTranslations, getLocale, getMessages } from 'next-intl/server';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { BacArchivesClient } from './client';

export const revalidate = 3600;

const PAGE_PATH = '/bac/archives';
const PAGE_URL_FR = `${SITE_URL}/fr${PAGE_PATH}`;
const PAGE_URL_AR = `${SITE_URL}/ar${PAGE_PATH}`;
const PARENT_URL = `${SITE_URL}/bac`;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const stats = getBacStats();
  const yearMin = stats.yearRange?.min ?? 2010;
  const yearMax = stats.yearRange?.max ?? 2025;
  const title = isAr
    ? `أرشيف الباكالوريا التونسية — ${stats.totalFiles} ملف من ${yearMin} إلى ${yearMax}`
    : `Archives Bac Tunisie — ${stats.totalFiles} fichiers de ${yearMin} à ${yearMax}`;
  const desc = isAr
    ? `📥 ${stats.totalFiles} ملف من مواضيع وإصلاحات الباكالوريا التونسية من ${yearMin} إلى ${yearMax} — ${stats.sectionsCount} شعب، ${stats.subjectsCount} مواد، دورة رئيسية ومراقبة. تصفية، بحث، تحميل مباشر.`
    : `📥 ${stats.totalFiles} fichiers de sujets et corrigés du Bac tunisien de ${yearMin} à ${yearMax} — ${stats.sectionsCount} sections, ${stats.subjectsCount} matières, sessions principale et contrôle. Filtre, recherche, téléchargement direct.`;

  return {
    title,
    description: desc,
    keywords: isAr
      ? [
          'أرشيف الباكالوريا تونس',
          'مواضيع باكالوريا 2010-2025',
          'إصلاحات باكالوريا تونس',
          'باكالوريا 2025',
          'باكالوريا 2024',
          'باكالوريا 2023',
          'باكالوريا 2022',
          'باكالوريا 2021',
          'باكالوريا 2020',
          'باكالوريا 2019',
          'باكالوريا 2018',
          'باكالوريا 2017',
          'باكالوريا 2016',
          'باكالوريا 2015',
          'باكالوريا 2014',
          'باكالوريا 2013',
          'باكالوريا 2012',
          'باكالوريا 2011',
          'باكالوريا 2010',
          'دورة رئيسية',
          'دورة مراقبة',
          'مواضيع',
          'إصلاحات',
          'شعبة الرياضيات',
          'شعبة العلوم التجريبية',
          'شعبة الاقتصاد',
          'تحميل',
          'PDF مجاني',
          'examanet',
          'إكسامانت',
        ]
      : [
          'archives bac tunisie',
          'sujets bac 2010-2025',
          'corrigés bac tunisie',
          'bac 2025',
          'bac 2024',
          'bac 2023',
          'bac 2022',
          'bac 2021',
          'bac 2020',
          'bac 2019',
          'bac 2018',
          'bac 2017',
          'bac 2016',
          'bac 2015',
          'bac 2014',
          'bac 2013',
          'bac 2012',
          'bac 2011',
          'bac 2010',
          'session principale',
          'session controle',
          'rattrapage bac',
          'sujets',
          'corrigés',
          'math bac',
          'physique bac',
          'svt bac',
          'télécharger',
          'PDF gratuit',
          'examanet bac',
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
      locale: isAr ? 'ar_TN' : 'fr_TN',
      type: 'website',
      images: [{ url: '/api/og/page/bac', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: ['/api/og/page/bac'],
    },
  };
}

interface PageProps {
  searchParams: {
    year?: string;
    section?: string;
    subject?: string;
    session?: string;
    type?: string;
    q?: string;
  };
}

export default async function BacArchivesPage({ searchParams }: PageProps) {
  const t = await getTranslations();
  const dict = await getTranslations();
  const messages = await getMessages();
  const locale = await getLocale();
  const isAr = locale === 'ar';

  const stats = getBacStats();
  const yearGroups = groupByYearForArchive();

  // Server-side initial filter (from URL params)
  const yearFilter = searchParams.year ? parseInt(searchParams.year, 10) : null;
  const sectionFilter = searchParams.section || null;
  const subjectFilter = searchParams.subject || null;
  const sessionFilter = searchParams.session || null;
  const typeFilter = searchParams.type || null;
  const qFilter = (searchParams.q || '').toLowerCase();

  const filteredYears = yearGroups
    .map((yg) => {
      if (yearFilter && yg.year !== yearFilter) return null;
      const filteredSections: typeof yg.sections = {};
      for (const [section, sessions] of Object.entries(yg.sections)) {
        if (sectionFilter && section !== sectionFilter) continue;
        const filteredSessions: any = {};
        for (const [session, files] of Object.entries(sessions)) {
          if (sessionFilter && session !== sessionFilter) continue;
          let filtered = files;
          if (typeFilter === 'sujet') {
            filtered = files.filter((f: any) => f.type === 'sujets');
          } else if (typeFilter === 'corrige') {
            filtered = files.filter((f: any) => f.type === 'corriges');
          }
          if (subjectFilter) {
            filtered = filtered.filter((f: any) => f.subject === subjectFilter);
          }
          if (qFilter) {
            filtered = filtered.filter((f: any) => {
              const searchStr =
                `${yg.year} ${section} ${session} ${f.subject} ${f.type}`.toLowerCase();
              return searchStr.includes(qFilter);
            });
          }
          if (filtered.length === 0) continue;
          filteredSessions[session] = filtered;
        }
        if (Object.keys(filteredSessions).length > 0) {
          filteredSections[section] = filteredSessions;
        }
      }
      if (Object.keys(filteredSections).length === 0) return null;
      return { ...yg, sections: filteredSections };
    })
    .filter((yg): yg is NonNullable<typeof yg> => yg !== null);

  // For structured data — list first 50 files
  const allFiles = filteredYears
    .flatMap((yg) =>
      Object.values(yg.sections).flatMap((sess) => Object.values(sess).flatMap((files) => files)),
    )
    .slice(0, 50);

  const itemListJsonLd = itemListSchema({
    name: t('bac.archives.title') || 'Archives Bac Tunisie',
    description: `${stats.totalFiles} fichiers de sujets et corrigés du Bac tunisien de ${stats.yearRange?.min ?? 2010} à ${stats.yearRange?.max ?? 2025}`,
    url: isAr ? PAGE_URL_AR : PAGE_URL_FR,
    items: allFiles.map((f: any) => ({
      name: `${f.subject} ${f.year} ${f.session === 'principale' ? (isAr ? 'د.ر' : 'P') : isAr ? 'د.م' : 'C'} ${f.type === 'sujets' ? (isAr ? 'موضوع' : 'Sujet') : isAr ? 'إصلاح' : 'Corrigé'}`,
      url: f.url,
    })),
  });

  const breadcrumbJsonLd = breadcrumbSchema(
    [
      { name: t('common.home') || 'Accueil', url: SITE_URL },
      { name: t('levels.bac') || 'Bac', url: PARENT_URL },
      { name: t('bac.archives.title') || 'Archives', url: isAr ? PAGE_URL_AR : PAGE_URL_FR },
    ],
    (await getLocale()) as 'fr' | 'ar'
  );

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
        <section className="relative bg-gradient-to-br from-violet-50 via-white to-amber-50 py-8 lg:py-12 overflow-hidden">
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-gradient-to-br from-violet-300 to-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-gradient-to-br from-amber-300 to-orange-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <nav
              aria-label="Fil d'Ariane"
              className="flex items-center gap-1 text-xs text-slate-500 mb-4 flex-wrap"
            >
              <Link href="/" className="hover:text-primary-600 transition">
                {t('common.home') || 'Accueil'}
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <Link href="/bac" className="hover:text-primary-600 transition">
                {t('levels.bac') || 'Bac'}
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="text-slate-900 font-semibold">
                {t('bac.archives.title') || 'Archives'}
              </span>
            </nav>

            <Link
              href="/bac"
              className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 font-semibold mb-4"
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" />{' '}
              {t('bac.archives.backToPillar') || (isAr ? 'العودة إلى الباكالوريا' : 'Retour à Bac')}
            </Link>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight mb-2">
                  {(() => {
                    const title =
                      t('bac.archives.heroTitle') ||
                      (isAr ? `أرشيف الباكالوريا` : `Archives du Baccalauréat`);
                    const parts = title.split('{highlight}');
                    return (
                      <>
                        {parts[0]}
                        <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-amber-600 bg-clip-text text-transparent">
                          {parts[1] || ''}
                        </span>
                      </>
                    );
                  })()}
                </h1>
                <p className="text-base lg:text-lg text-slate-600">
                  <strong>
                    {stats.totalFiles} {isAr ? 'ملف' : 'fichiers'}
                  </strong>{' '}
                  {isAr
                    ? `من 2010 إلى 2025 — ${stats.sectionsCount} شعب، ${stats.subjectsCount} مواد. تصفية، بحث، تحميل مباشر.`
                    : `collectés depuis 2010 — ${stats.sectionsCount} sections, ${stats.subjectsCount} matières. Filtre, recherche, téléchargement.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="bg-white border border-slate-200 rounded-full px-3 py-1.5 font-semibold text-slate-700">
                  {isAr ? `${stats.totalSujets} موضوع` : `${stats.totalSujets} sujets`}
                </span>
                <span className="bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-3 py-1.5 font-semibold">
                  {isAr ? `${stats.totalCorriges} إصلاح` : `${stats.totalCorriges} corrigés`}
                </span>
                <span className="bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-3 py-1.5 font-semibold">
                  {isAr ? `${stats.sectionsCount} شعب` : `${stats.sectionsCount} sections`}
                </span>
                {stats.yearRange && (
                  <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1.5 font-semibold">
                    {stats.yearRange.min}–{stats.yearRange.max}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <BacArchivesClient
          yearGroups={filteredYears.map((yg): any => ({
            year: yg.year,
            total: yg.total,
            sujets: yg.sujets,
            corriges: yg.corriges,
            sections: Object.fromEntries(
              Object.entries(yg.sections).map(([section, sessions]) => [
                section,
                Object.fromEntries(
                  Object.entries(sessions).map(([session, files]) => [
                    session,
                    files.map((f: any) => ({
                      url: f.url,
                      subject: f.subject,
                      subjectName: f.subjectMeta?.nameFr || f.subject,
                      subjectNameAr: f.subjectMeta?.nameAr,
                      type: f.type,
                      session: f.session,
                      section: f.section,
                    })),
                  ]),
                ),
              ]),
            ),
          }))}
          allYearGroups={yearGroups.map((yg): any => ({
            year: yg.year,
            total: yg.total,
            sujets: yg.sujets,
            corriges: yg.corriges,
            sections: Object.fromEntries(
              Object.entries(yg.sections).map(([section, sessions]) => [
                section,
                Object.fromEntries(
                  Object.entries(sessions).map(([session, files]) => [
                    session,
                    files.slice(0, 1), // only need to know subjects exist
                  ]),
                ),
              ]),
            ),
          }))}
          totalFiles={stats.totalFiles}
        />
      </main>

      </div>
  );
}

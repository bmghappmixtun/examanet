// @ts-nocheck
/**
 * /[locale]/classes — SEO hub listing every class and filière.
 *
 * 2026-10-22 — the entry point of the new class × section landing tree. Gives
 * Google one crawlable page that links to all 26 children (hub-and-spoke),
 * instead of 26 orphan pages only reachable from JS-driven menu filters.
 */

import type { Metadata } from 'next';
// 2026-10-22 : le `Link` i18n (et non `next/link`) est INDISPENSABLE ici.
// Avec `next/link`, href="/classes/7eme" sortait tel quel SANS le préfixe
// /fr → le hub ne liait pas ses enfants et Google suivait une URL non
// canonique. `Link` de @/i18n/navigation préfixe la locale automatiquement.
import { Link } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';
import { getClassPages } from '@/lib/classes-seo';
import { breadcrumbSchema } from '@/lib/structured-data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr
      ? 'جميع المستويات والمسالك — دروس وفروض تونس | إكسامانت'
      : 'Tous les niveaux et filières — cours et devoirs Tunisie | Examanet',
    description: isAr
      ? 'الإعدادي والثانوي في تونس: السنة 7، 8، 9 والسنة الأولى إلى الرابعة ثانوي، مع كل المسالك. دروس، فروض وإصلاحات مجانية.'
      : "Collège et lycée en Tunisie : 7ème, 8ème, 9ème année et 1ère à 4ème année secondaire, avec toutes les filières (maths, sciences, lettres, informatique). Cours, devoirs et corrigés gratuits.",
    alternates: {
      canonical: `${SITE_URL}/${locale}/classes`,
      languages: {
        fr: `${SITE_URL}/fr/classes`,
        ar: `${SITE_URL}/ar/classes`,
      },
    },
    openGraph: {
      title: isAr ? 'جميع المستويات والمسالك' : 'Tous les niveaux et filières',
      description: isAr
        ? 'الإعدادي والثانوي في تونس، كل المسالك، دروس مجانية.'
        : 'Collège et lycée en Tunisie, toutes filières, cours gratuits.',
      url: `${SITE_URL}/${locale}/classes`,
      siteName: isAr ? 'إكسامانت' : 'Examanet',
      locale: isAr ? 'ar_TN' : 'fr_TN',
      type: 'website',
    },
  };
}

export default async function ClassesHub() {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const pages = getClassPages();

  const breadcrumbLd = breadcrumbSchema([
    { name: isAr ? 'الرئيسية' : 'Accueil', url: `${SITE_URL}/${locale}` },
    { name: isAr ? 'المستويات' : 'Niveaux', url: `${SITE_URL}/${locale}/classes` },
  ]);

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: isAr ? 'المستويات الدراسية' : 'Niveaux scolaires',
    itemListElement: pages.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/${locale}${c.path}`,
      name: isAr ? c.label.ar : c.label.fr,
    })),
  };

  const college = pages.filter((c) => c.cycle === 'college');
  const lycee = pages.filter((c) => c.cycle === 'lycee');

  const renderGroup = (group: typeof pages, heading: { fr: string; ar: string }) => (
    <section className="mb-10">
      <h2 className="text-xl font-extrabold text-slate-900 mb-4">
        {isAr ? heading.ar : heading.fr}
      </h2>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {group.map((c) => (
          <li key={c.slug}>
            <Link
              href={c.path}
              className="group block rounded-2xl border border-slate-200 bg-white p-5 hover:border-primary-400 hover:shadow-md transition min-w-0"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 mb-1">
                {isAr ? c.cycleLabel.ar : c.cycleLabel.fr}
              </p>
              <p className="font-bold text-slate-900 mb-1">{isAr ? c.label.ar : c.label.fr}</p>
              {c.sections.length > 0 ? (
                <p className="text-xs text-slate-500 leading-relaxed">
                  {isAr
                    ? c.sections.map((s) => s.label.ar).join(' · ')
                    : c.sections.map((s) => s.label.fr).join(' · ')}
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  {isAr ? 'كل المواد' : 'Toutes les matières'}
                </p>
              )}
              <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-primary-700 group-hover:underline">
                {isAr ? 'عرض' : 'Voir'}
                <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-primary-700">
                {isAr ? 'الرئيسية' : 'Accueil'}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </li>
            <li aria-current="page" className="text-slate-700 font-semibold">
              {isAr ? 'المستويات' : 'Niveaux'}
            </li>
          </ol>
        </nav>

        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 leading-tight mb-3">
            {isAr ? 'جميع المستويات والمسالك الدراسية' : 'Tous les niveaux et filières scolaires'}
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-3xl leading-relaxed">
            {isAr
              ? 'اختر مستواك ثم المسالك، واستفد من الدروس والفروض والسلاسل مع الإصلاحات، مجانا ودون تسجيل.'
              : 'Choisissez votre année puis votre filière, et accédez aux cours, devoirs, séries et corrigés correspondants — gratuitement et sans inscription.'}
          </p>
        </header>

        {renderGroup(college, { fr: 'Collège (7e, 8e, 9e année)', ar: 'الإعدادي (السنة 7، 8، 9)' })}
        {renderGroup(lycee, { fr: 'Lycée (1re → 4e année)', ar: 'الثانوي (الأولى → الرابعة)' })}
      </div>
    </>
  );
}
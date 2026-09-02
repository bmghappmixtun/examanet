import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import {
  getConcoursStats,
  getCorriges2020Plus,
  getUpcomingCorriges,
  getSubjectMeta,
  groupByYear,
} from '@/lib/concours-9eme-data';
import {
  courseSchema,
  faqSchema,
  breadcrumbSchema,
  itemListSchema,
  SITE_URL,
} from '@/lib/structured-data';
import { getTranslations, getLocale } from 'next-intl/server';
import {
  ChevronRight,
  Sparkles,
  Award,
  Clock,
  Target,
  CheckCircle,
  ArrowRight,
  Calendar,
  Trophy,
  FileText,
  Download,
  Star,
  Zap,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';

export const revalidate = 3600; // ISR: refresh every hour

const PAGE_PATH = '/concours-9eme-tunisie';
const PAGE_URL_FR = `${SITE_URL}/fr${PAGE_PATH}`;
const PAGE_URL_AR = `${SITE_URL}/ar${PAGE_PATH}`;

// ============================================================================
// METADATA — generated dynamically based on locale
// ============================================================================
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const stats = getConcoursStats();
  const title = t('concours.meta.title').replace('{total}', String(stats.totalFiles));
  const desc = t('concours.meta.description').replace('{total}', String(stats.totalFiles));
  return {
    title,
    description: desc,
    keywords:
      locale === 'ar'
        ? [
            'مناظرة التاسعة تونس',
            'مناظرة السنة التاسعة',
            'امتحان التاسعة تونس',
            'مواضيع التاسعة',
            'إصلاحات التاسعة تونس',
            'مناظرة التاسعة 2027',
            'brevet tunisie',
            'تاسعة أساسي',
            'concours noviam',
            'مناظرة ختم التعليم الأساسي',
            'examanet concours',
          ]
        : [
            'concours 9ème tunisie',
            'concours 9ème année',
            'examen 9ème tunisie',
            'sujets 9ème année',
            'corrigés 9ème tunisie',
            'concours 9eme 2027',
            'brevet tunisie',
            '9ème année de base',
            'concours noviam',
            'مناظرة التاسعة أساسي تونس',
            'إصلاح مناظرة السنة التاسعة',
            'examanet concours',
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
      images: [
        {
          url: '/api/og/page/concours',
          width: 1200,
          height: 630,
          alt:
            locale === 'ar' ? 'Examanet — مناظرة التاسعة تونس' : 'Examanet — Concours 9ème Tunisie',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: ['/api/og/page/concours'],
    },
  };
}

// ============================================================================
// PAGE
// ============================================================================
export default async function Concours9emePillar() {
  const t = await getTranslations();
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const stats = getConcoursStats();
  const corriges2020Plus = getCorriges2020Plus();
  const upcoming = getUpcomingCorriges();
  const yearGroups = groupByYear().slice(0, 10);

  // ========================================================================
  // SUBJECT DATA (i18n-driven)
  // ========================================================================
  const SUBJECTS = [
    {
      slug: 'math',
      nameFr: 'Mathématiques',
      nameAr: 'الرياضيات',
      icon: '📐',
      color: 'text-blue-600',
      bg: 'bg-blue-100',
      descFr: 'Algèbre, géométrie, fonctions',
    },
    {
      slug: 'arabe',
      nameFr: 'Arabe',
      nameAr: 'العربية',
      icon: '📚',
      color: 'text-amber-600',
      bg: 'bg-amber-100',
      descFr: 'قواعد، بلاغة، تعبير',
    },
    {
      slug: 'francais',
      nameFr: 'Français',
      nameAr: 'الفرنسية',
      icon: '📖',
      color: 'text-rose-600',
      bg: 'bg-rose-100',
      descFr: 'Grammaire, expression, lecture',
    },
    {
      slug: 'svt',
      nameFr: 'Sciences de la Vie et de la Terre',
      nameAr: 'علوم الحياة والأرض',
      icon: '🧬',
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
      descFr: 'Biologie, géologie, écologie',
    },
    {
      slug: 'physique',
      nameFr: 'Physique (technique)',
      nameAr: 'علوم فيزيائية',
      icon: '⚛️',
      color: 'text-purple-600',
      bg: 'bg-purple-100',
      descFr: 'Mécanique, électricité, optique',
    },
    {
      slug: 'anglais',
      nameFr: 'Anglais',
      nameAr: 'الإنجليزية',
      icon: '🌍',
      color: 'text-cyan-600',
      bg: 'bg-cyan-100',
      descFr: 'Grammar, vocabulary, comprehension',
    },
  ];

  // ========================================================================
  // METHODOLOGY (i18n-driven)
  // ========================================================================
  const METHODOLOGIE = [
    {
      subject: 'math',
      titleFr: 'Mathématiques',
      titleAr: 'الرياضيات',
      icon: '📐',
      colorClass: 'border-blue-400 bg-blue-50',
      iconBg: 'bg-blue-100 text-blue-600',
      points: [
        'Maîtrise les 4 opérations (fractions, puissances, racines carrées)',
        'Algèbre : équations 1er et 2nd degré, systèmes linéaires',
        'Géométrie : Pythagore, Thalès, trigonométrie, aires et volumes',
        'Statistiques : moyenne, médiane, étendue, lecture de graphiques',
      ],
    },
    {
      subject: 'arabe',
      titleFr: 'Arabe',
      titleAr: 'العربية',
      icon: '📚',
      colorClass: 'border-amber-400 bg-amber-50',
      iconBg: 'bg-amber-100 text-amber-600',
      points: [
        'قراءة نصوص أدبية مع أسئلة الفهم والتحليل',
        'قواعد النحو : الإعراب، المبتدأ والخبر، الفاعل والمفعول',
        'البلاغة : التشبيه، الاستعارة، الكناية',
        'الإنتاج الكتابي : كتابة مقالات وفق منهجية واضحة',
      ],
    },
    {
      subject: 'francais',
      titleFr: 'Français',
      titleAr: 'الفرنسية',
      icon: '📖',
      colorClass: 'border-rose-400 bg-rose-50',
      iconBg: 'bg-rose-100 text-rose-600',
      points: [
        "Compréhension écrite : identifier les idées principales d'un texte",
        'Grammaire : analyse logique et grammaticale, classes de mots',
        'Conjugaison : tous les temps du mode indicatif + subjonctif',
        'Expression écrite : dissertation, texte argumentatif, récit',
      ],
    },
    {
      subject: 'svt',
      titleFr: 'Sciences de la Vie et de la Terre',
      titleAr: 'علوم الحياة والأرض',
      icon: '🧬',
      colorClass: 'border-emerald-400 bg-emerald-50',
      iconBg: 'bg-emerald-100 text-emerald-600',
      points: [
        'Biologie : cellule, ADN, génétique, immunologie',
        'Géologie : séismes, volcans, structure interne de la Terre',
        'Écologie : écosystèmes, chaînes alimentaires, environnement',
        'Méthode : schémas bilan + mémorisation des définitions',
      ],
    },
    {
      subject: 'physique',
      titleFr: 'Physique (voie technique)',
      titleAr: 'علوم فيزيائية',
      icon: '⚛️',
      colorClass: 'border-purple-400 bg-purple-50',
      iconBg: 'bg-purple-100 text-purple-600',
      points: [
        'Mécanique : forces, mouvements, équilibre, énergie',
        "Électricité : circuits, loi d'Ohm, puissance, énergie électrique",
        'Optique : propagation, lentilles, réflexion, réfraction',
        'Résolution : appliquer la démarche scientifique',
      ],
    },
    {
      subject: 'anglais',
      titleFr: 'Anglais',
      titleAr: 'الإنجليزية',
      icon: '🌍',
      colorClass: 'border-cyan-400 bg-cyan-50',
      iconBg: 'bg-cyan-100 text-cyan-600',
      points: [
        'Reading comprehension : repérer les mots-clés et inférer le sens',
        'Grammar : tenses (present/past/future), modals, conditionals',
        'Vocabulary : everyday topics (school, family, hobbies, environment)',
        'Writing : emails, short essays (80-120 words)',
      ],
    },
  ];

  const PYRAMIDE_LEVELS = [
    { level: 1, key: 'l1', color: 'from-blue-200 to-blue-300', width: 'w-3/4' },
    { level: 2, key: 'l2', color: 'from-blue-300 to-blue-400', width: 'w-2/3' },
    { level: 3, key: 'l3', color: 'from-blue-400 to-blue-500', width: 'w-1/2' },
    { level: 4, key: 'l4', color: 'from-blue-500 to-blue-600', width: 'w-2/5' },
    { level: 5, key: 'l5', color: 'from-blue-600 to-blue-700', width: 'w-1/3' },
  ];

  const CALENDAR_2027_KEYS = [
    'inscription',
    'announcement',
    'revision',
    'exam',
    'results',
    'orientation',
  ];
  const CALENDAR_EMOJI = ['📝', '📅', '📚', '✍️', '🎉', '🏫'];

  // ========================================================================
  // COMPARISON (i18n-driven)
  // ========================================================================
  const COMPARISON = {
    general: {
      title: t('concours.comparison.general.title'),
      subtitle: t('concours.comparison.general.subtitle'),
      desc: t('concours.comparison.general.desc'),
      icon: '🎓',
      color: 'indigo',
      epreuves: [
        { name: 'Mathématiques (coeff. 2)' },
        { name: 'Arabe (coeff. 2)' },
        { name: 'Français (coeff. 2)' },
        { name: 'SVT (coeff. 1.5)' },
        { name: 'Anglais (coeff. 1.5)' },
        { name: 'Histoire-Géographie (coeff. 1)' },
      ],
    },
    technique: {
      title: t('concours.comparison.technique.title'),
      subtitle: t('concours.comparison.technique.subtitle'),
      desc: t('concours.comparison.technique.desc'),
      icon: '🔧',
      color: 'orange',
      epreuves: [
        { name: 'Mathématiques (coeff. 2)' },
        { name: 'Arabe (coeff. 1.5)' },
        { name: 'Français (coeff. 1.5)' },
        { name: 'Physique technique (coeff. 2)' },
        { name: 'Technologie (coeff. 1)' },
        { name: 'Anglais (coeff. 1)' },
      ],
    },
  };

  // ========================================================================
  // FAQS — loaded from i18n
  // ========================================================================
  const faqItems = [
    t('concours.faq.items.0.q'),
    t('concours.faq.items.0.a'),
    t('concours.faq.items.1.q'),
    t('concours.faq.items.1.a'),
    t('concours.faq.items.2.q'),
    t('concours.faq.items.2.a'),
    t('concours.faq.items.3.q'),
    t('concours.faq.items.3.a'),
    t('concours.faq.items.4.q'),
    t('concours.faq.items.4.a'),
    t('concours.faq.items.5.q'),
    t('concours.faq.items.5.a'),
    t('concours.faq.items.6.q'),
    t('concours.faq.items.6.a'),
    t('concours.faq.items.7.q'),
    t('concours.faq.items.7.a'),
  ];
  const FAQS = [];
  for (let i = 0; i < faqItems.length; i += 2) {
    FAQS.push({ q: faqItems[i], a: faqItems[i + 1] });
  }

  // ========================================================================
  // FEATURES
  // ========================================================================
  const FEATURES = [
    {
      icon: CheckCircle,
      title: t('concours.about.features.f1t'),
      desc: t('concours.about.features.f1d'),
    },
    {
      icon: Award,
      title: t('concours.about.features.f2t').replace('{count}', String(stats.totalCorriges)),
      desc: t('concours.about.features.f2d'),
    },
    {
      icon: Target,
      title: t('concours.about.features.f3t'),
      desc: t('concours.about.features.f3d'),
    },
    {
      icon: Sparkles,
      title: t('concours.about.features.f4t'),
      desc: t('concours.about.features.f4d'),
    },
    {
      icon: Clock,
      title: t('concours.about.features.f5t'),
      desc: t('concours.about.features.f5d'),
    },
    {
      icon: Trophy,
      title: t('concours.about.features.f6t'),
      desc: t('concours.about.features.f6d'),
    },
  ];

  // ========================================================================
  // JSON-LD
  // ========================================================================
  const courseJsonLd = courseSchema({
    slug: 'concours-9eme-tunisie',
    title: t('concours.meta.title').replace('{total}', String(stats.totalFiles)),
    description: t('concours.meta.description').replace('{total}', String(stats.totalFiles)),
    language: await getLocale(),
    level: '9ème année de base',
    cycle: 'Enseignement de base',
    subject: 'Multidisciplinaire',
    type: 'COURSE',
    year: '2027',
    url: isAr ? PAGE_URL_AR : PAGE_URL_FR,
    datePublished: '2026-07-01',
    dateModified: new Date().toISOString().split('T')[0],
    aggregateRating: { ratingCount: 1250, ratingValue: 4.7 },
  });

  const faqJsonLd = faqSchema(FAQS.map((f) => ({ question: f.q, answer: f.a })));
  const breadcrumbJsonLd = breadcrumbSchema([
    { name: 'Accueil', url: SITE_URL },
    { name: 'Collège', url: `${SITE_URL}/college` },
    { name: '9ème année', url: `${SITE_URL}/ressources?class=9eme` },
    { name: t('concours.breadcrumb.concours9eme'), url: isAr ? PAGE_URL_AR : PAGE_URL_FR },
  ]);

  const itemListJsonLd = itemListSchema({
    name: t('concours.meta.title').replace('{total}', String(stats.totalFiles)),
    description: `Liste des sujets et corrigés du concours 9ème année en Tunisie depuis 2001`,
    url: isAr ? PAGE_URL_AR : PAGE_URL_FR,
    items: stats.gold2020Corrige
      ? [
          {
            name: `⭐ Corrigé Math 2020 — Concours 9ème (sujet + correction)`,
            url: stats.gold2020Corrige.url,
            description:
              'Sujet et corrigé du concours 9ème année 2020 — Mathématiques, voie générale (référence ministère).',
          },
          ...yearGroups.slice(0, 49).map((yg) => ({
            name: `Sujets du concours 9ème ${yg.year}`,
            url: `${isAr ? PAGE_URL_AR : PAGE_URL_FR}/sujets-passes?year=${yg.year}`,
          })),
        ]
      : yearGroups.slice(0, 50).map((yg) => ({
          name: `Sujets du concours 9ème ${yg.year}`,
          url: `${isAr ? PAGE_URL_AR : PAGE_URL_FR}/sujets-passes?year=${yg.year}`,
        })),
  });

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <main className="flex-1 pt-20">
        {/* ========== HERO ========== */}
        <section className="relative bg-gradient-to-br from-primary-50 via-white to-amber-50 py-12 lg:py-20 overflow-hidden">
          <div className="absolute top-20 -left-20 w-96 h-96 bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
          <div className="absolute top-40 -right-20 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <nav
              aria-label="Fil d'Ariane"
              className="flex items-center gap-1 text-xs text-slate-500 mb-6 flex-wrap"
            >
              <Link href="/" className="hover:text-primary-600 transition">
                {t('nav.home') || 'Accueil'}
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <Link href="/college" className="hover:text-primary-600 transition">
                Collège
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="text-slate-900 font-semibold">
                {t('concours.breadcrumb.concours9eme')}
              </span>
            </nav>

            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-white border border-amber-200 rounded-full px-4 py-2 mb-6 shadow-sm">
                <Trophy className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-semibold text-slate-700">
                  {t('concours.hero.badge')}
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
                {(() => {
                  const full = t('concours.hero.titleMain');
                  const splitIdx = full.indexOf('{highlight}');
                  if (splitIdx >= 0) {
                    const before = full.slice(0, splitIdx);
                    const after = full.slice(splitIdx + '{highlight}'.length);
                    return (
                      <>
                        {before}
                        <span className="gradient-text">{after}</span>
                      </>
                    );
                  }
                  return <>{full}</>;
                })()}
                <br />
                <span className="text-2xl sm:text-3xl lg:text-4xl text-slate-700">
                  {t('concours.hero.titleSub')}
                </span>
              </h1>

              <p
                className="text-lg lg:text-xl text-slate-600 max-w-3xl mx-auto mb-8"
                dangerouslySetInnerHTML={{
                  __html: t('concours.hero.description')
                    .replace('{strong}', '<strong>')
                    .replace('{strongEnd}', '</strong>')
                    .replace('{strongHighlight}', '<strong class="text-primary-600">')
                    .replace('{strongHighlightEnd}', '</strong>')
                    .replace('{total}', String(stats.totalFiles)),
                }}
              />

              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/concours-9eme-tunisie/sujets-passes"
                  className="btn-primary text-base inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> {t('concours.hero.ctaSujets')}
                </Link>
                <a href="#methodologie" className="btn-secondary text-base">
                  {t('concours.hero.ctaMethodo')}
                </a>
              </div>
            </div>

            {/* STATS BAR */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl lg:text-4xl font-extrabold text-primary-600 mb-1">
                  {stats.totalFiles}
                </div>
                <div className="text-xs text-slate-500 font-semibold uppercase">
                  {t('concours.hero.stats.pdf')}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl lg:text-4xl font-extrabold text-emerald-600 mb-1">
                  {stats.yearsAvailable.length}
                </div>
                <div className="text-xs text-slate-500 font-semibold uppercase">
                  {t('concours.hero.stats.years')}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl lg:text-4xl font-extrabold text-amber-600 mb-1">
                  {stats.totalCorriges}
                </div>
                <div className="text-xs text-slate-500 font-semibold uppercase">
                  {t('concours.hero.stats.corriges')}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl lg:text-4xl font-extrabold text-purple-600 mb-1">6</div>
                <div className="text-xs text-slate-500 font-semibold uppercase">
                  {t('concours.hero.stats.matieres')}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl lg:text-4xl font-extrabold text-rose-600 mb-1">2</div>
                <div className="text-xs text-slate-500 font-semibold uppercase">
                  {t('concours.hero.stats.voies')}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========== QU'EST-CE QUE C'EST (E-E-A-T) ========== */}
        <section className="py-16 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-extrabold mb-6 text-slate-900">
                  {t('concours.about.title')}
                </h2>
                <p
                  className="text-slate-700 leading-relaxed mb-4"
                  dangerouslySetInnerHTML={{
                    __html: t('concours.about.p1')
                      .replace(/\{strong\}/g, '<strong>')
                      .replace(/\{strongEnd\}/g, '</strong>')
                      .replace(/\{ar\}/g, '<span dir="rtl">')
                      .replace(/\{arEnd\}/g, '</span>'),
                  }}
                />
                <p
                  className="text-slate-700 leading-relaxed mb-4"
                  dangerouslySetInnerHTML={{
                    __html: t('concours.about.p2')
                      .replace(/\{strong\}/g, '<strong>')
                      .replace(/\{strongEnd\}/g, '</strong>'),
                  }}
                />
                <p
                  className="text-slate-700 leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: t('concours.about.p3')
                      .replace(/\{strong\}/g, '<strong>')
                      .replace(/\{strongEnd\}/g, '</strong>'),
                  }}
                />
              </div>
              <div className="space-y-3">
                {FEATURES.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0">
                      <f.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{f.title}</div>
                      <div className="text-xs text-slate-600">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ========== MATIÈRES ========== */}
        <section
          id="matieres"
          className="py-16 bg-gradient-to-br from-slate-50 to-primary-50 scroll-mt-20"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-extrabold mb-3 text-slate-900">
                {t('concours.subjects.title')}
              </h2>
              <p className="text-lg text-slate-600">{t('concours.subjects.subtitle')}</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SUBJECTS.map((m) => (
                <Link
                  key={m.slug}
                  href={`/concours-9eme-tunisie/sujets-passes?subject=${m.slug}`}
                  className="group bg-white rounded-2xl p-5 border border-slate-100 hover:border-primary-300 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${m.bg}`}
                    >
                      {m.icon}
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-primary-600 group-hover:translate-x-1 transition-all" />
                  </div>
                  {locale === 'ar' ? (
                    <>
                      <h3
                        dir="rtl"
                        className="font-bold text-lg mb-1 text-slate-900 group-hover:text-primary-600 transition text-right"
                      >
                        {m.nameAr}
                      </h3>
                      <p className="text-sm text-slate-500 mb-2">{m.nameFr}</p>
                    </>
                  ) : (
                    <>
                      <h3 className="font-bold text-lg mb-1 text-slate-900 group-hover:text-primary-600 transition">
                        {m.nameFr}
                      </h3>
                      <p dir="rtl" className="text-sm text-slate-500 mb-2">
                        {m.nameAr}
                      </p>
                    </>
                  )}
                  <p className="text-xs text-slate-500">{m.descFr}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ========== MÉTHODOLOGIE PAR MATIÈRE ========== */}
        <section id="methodologie" className="py-16 bg-white scroll-mt-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-extrabold mb-3 text-slate-900">
                {t('concours.methodology.title')}
              </h2>
              <p
                className="text-lg text-slate-600 max-w-3xl mx-auto"
                dangerouslySetInnerHTML={{
                  __html: t('concours.methodology.subtitle')
                    .replace(/\{strong\}/g, '<strong>')
                    .replace(/\{strongEnd\}/g, '</strong>'),
                }}
              />
              <p dir="rtl" className="block mt-2 text-slate-500 text-base">
                {t('concours.methodology.subtitleAr')}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {METHODOLOGIE.map((m) => (
                <div
                  key={m.subject}
                  className={`bg-white rounded-2xl p-6 ${locale === 'ar' ? 'border-r-4' : 'border-l-4'} ${m.colorClass} shadow-sm hover:shadow-md transition`}
                >
                  <div
                    className={`flex items-center gap-3 mb-4 ${locale === 'ar' ? 'flex-row-reverse' : ''}`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${m.iconBg}`}
                    >
                      {m.icon}
                    </div>
                    <div className={`flex-1 ${locale === 'ar' ? 'text-right' : 'text-left'}`}>
                      <h3
                        className="font-bold text-lg text-slate-900"
                        dir={locale === 'ar' ? 'rtl' : 'ltr'}
                      >
                        {locale === 'ar' ? m.titleAr : m.titleFr}
                      </h3>
                      <p className="text-xs text-slate-500" dir={locale === 'ar' ? 'ltr' : 'rtl'}>
                        {locale === 'ar' ? m.titleFr : m.titleAr}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {m.points.map((p, i) => {
                      const isAr = /[\u0600-\u06FF]/.test(p);
                      return (
                        <li
                          key={i}
                          className={`flex items-start gap-2 text-sm text-slate-700 ${isAr ? 'flex-row-reverse' : ''}`}
                        >
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                          <span
                            dir={isAr ? 'rtl' : 'ltr'}
                            className={`flex-1 ${isAr ? 'text-right' : 'text-left'}`}
                          >
                            {p}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== PYRAMIDE DE RÉVISION ========== */}
        <section className="py-16 bg-gradient-to-br from-slate-50 to-sky-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-extrabold mb-3 text-slate-900">
                {t('concours.pyramid.title')}
              </h2>
              <p
                className="text-lg text-slate-600"
                dangerouslySetInnerHTML={{
                  __html: t('concours.pyramid.subtitle')
                    .replace(/\{strong\}/g, '<strong>')
                    .replace(/\{strongEnd\}/g, '</strong>'),
                }}
              />
            </div>

            <div className="flex flex-col items-center gap-3">
              {PYRAMIDE_LEVELS.map((p) => (
                <div
                  key={p.level}
                  className={`${p.width} bg-gradient-to-r ${p.color} text-white font-bold text-center py-4 px-6 rounded-xl shadow-md hover:shadow-lg transition`}
                >
                  <span className="text-sm sm:text-base">
                    {t(`concours.pyramid.levels.${p.key}`)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-10 bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-3">
              <Zap className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-amber-900 mb-1">{t('concours.pyramid.tipTitle')}</h3>
                <p
                  className="text-sm text-amber-800"
                  dangerouslySetInnerHTML={{
                    __html: t('concours.pyramid.tipDesc')
                      .replace(/\{strong\}/g, '<strong>')
                      .replace(/\{strongEnd\}/g, '</strong>'),
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ========== CALENDRIER 2027 ========== */}
        <section id="calendrier" className="py-16 bg-white scroll-mt-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 rounded-full px-4 py-2 mb-4">
                <Calendar className="w-4 h-4" />
                <span className="text-xs font-bold uppercase">Calendrier 2027</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-extrabold mb-3 text-slate-900">
                {t('concours.calendar.title')}
              </h2>
              <p
                className="text-lg text-slate-600"
                dangerouslySetInnerHTML={{
                  __html: t('concours.calendar.subtitle')
                    .replace(/\{strong\}/g, '<strong>')
                    .replace(/\{strongEnd\}/g, '</strong>'),
                }}
              />
            </div>

            <div className="relative">
              <div className="absolute left-6 sm:left-1/2 top-0 bottom-0 w-0.5 bg-primary-200 sm:-translate-x-1/2" />
              <div className="space-y-6">
                {CALENDAR_2027_KEYS.map((key, i) => (
                  <div key={key} className="relative flex items-start gap-4 sm:gap-6">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white border-4 border-primary-200 flex items-center justify-center text-2xl z-10">
                      {CALENDAR_EMOJI[i]}
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-2xl p-5 hover:bg-slate-100 transition">
                      <div className="font-bold text-primary-600 text-sm uppercase mb-1">
                        {t(`concours.calendar.events.${key}.date`)}
                      </div>
                      <div className="text-slate-900 font-semibold">
                        {t(`concours.calendar.events.${key}.event`)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ========== COMPARAISON GÉNÉRALE vs TECHNIQUE ========== */}
        <section className="py-16 bg-gradient-to-br from-slate-50 to-amber-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-extrabold mb-3 text-slate-900">
                {t('concours.comparison.title')}
              </h2>
              <p
                className="text-lg text-slate-600 max-w-3xl mx-auto"
                dangerouslySetInnerHTML={{
                  __html: t('concours.comparison.subtitle')
                    .replace(/\{strong\}/g, '<strong>')
                    .replace(/\{strongEnd\}/g, '</strong>'),
                }}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {Object.entries(COMPARISON).map(([key, voie]) => (
                <div
                  key={key}
                  className={`bg-white rounded-3xl p-7 shadow-md border-2 ${
                    key === 'general'
                      ? 'border-indigo-100 hover:border-indigo-300'
                      : 'border-orange-100 hover:border-orange-300'
                  } transition`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`w-12 h-12 rounded-xl ${
                        key === 'general'
                          ? 'bg-indigo-100 text-indigo-600'
                          : 'bg-orange-100 text-orange-600'
                      } flex items-center justify-center text-2xl`}
                    >
                      {voie.icon}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-2xl text-slate-900">{voie.title}</h3>
                      <p dir="rtl" className="text-sm text-slate-500">
                        {voie.subtitle}
                      </p>
                    </div>
                  </div>
                  <p
                    className="text-slate-700 mb-4"
                    dangerouslySetInnerHTML={{
                      __html: voie.desc
                        .replace(/\{strong\}/g, '<strong>')
                        .replace(/\{strongEnd\}/g, '</strong>'),
                    }}
                  />
                  <div className="space-y-2">
                    <h4 className="font-bold text-sm text-slate-900 uppercase">
                      {t(`concours.comparison.${key}.epreuvesTitle`)}
                    </h4>
                    <ul className="text-sm text-slate-700 space-y-1.5">
                      {voie.epreuves.map((e, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />{' '}
                          {e.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== CORRIGÉS 2020+ (GOLD) ========== */}
        <section className="py-16 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-400 to-amber-600 text-white rounded-full px-4 py-2 mb-4 shadow-md">
                <Star className="w-4 h-4 fill-white" />
                <span className="text-xs font-bold uppercase">{t('concours.gold.badge')}</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-extrabold mb-3 text-slate-900">
                {t('concours.gold.title')}
              </h2>
              <p
                className="text-lg text-slate-600 max-w-3xl mx-auto"
                dangerouslySetInnerHTML={{
                  __html: t('concours.gold.subtitle')
                    .replace(/\{strong\}/g, '<strong>')
                    .replace(/\{strongEnd\}/g, '</strong>'),
                }}
              />
              <p dir="rtl" className="block mt-2 text-slate-500 text-base">
                {t('concours.gold.subtitleAr')}
              </p>
            </div>

            {corriges2020Plus.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                {corriges2020Plus.map((f) => {
                  const parts = f.key.split('/');
                  const year = parts[2];
                  const subject = (parts[5] || '')
                    .replace('.pdf', '')
                    .replace(/^sujets\+correction\//, '')
                    .replace(/-trial$/, '');
                  const subjectMeta = getSubjectMeta(subject);
                  return (
                    <a
                      key={f.key}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl p-5 border-2 border-amber-200 hover:border-amber-400 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="text-3xl">{subjectMeta?.icon || '📄'}</div>
                        <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-3 py-1">
                          {year}
                        </span>
                      </div>
                      <h3 className="font-bold text-lg text-slate-900 mb-1 group-hover:text-amber-700 transition">
                        {t('concours.gold.corrigeLabel')
                          .replace(
                            '{subject}',
                            (locale === 'ar' ? subjectMeta?.nameAr : subjectMeta?.nameFr) ||
                              subject,
                          )
                          .replace('{year}', year)}
                      </h3>
                      <p className="text-xs text-slate-500 mb-3">
                        {f.note || 'Sujet + corrigé combo'}
                      </p>
                      <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                        <Download className="w-4 h-4" /> {t('concours.gold.download')}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}

            {upcoming.length > 0 && (
              <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-6">
                <h3 className="font-bold text-lg mb-3 text-slate-700 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  {t('concours.gold.placeholderTitle')}
                </h3>
                <p className="text-sm text-slate-600 mb-4">{t('concours.gold.placeholderDesc')}</p>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {upcoming.map((u, i) => {
                    const meta = getSubjectMeta(u.subject);
                    return (
                      <div
                        key={i}
                        className="bg-white rounded-lg p-3 border border-slate-200 flex items-center gap-2"
                      >
                        <span className="text-xl opacity-50">{meta?.icon || '📄'}</span>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-medium text-slate-700 truncate"
                            dir={locale === 'ar' ? 'rtl' : 'ltr'}
                          >
                            {(locale === 'ar' ? meta?.nameAr : meta?.nameFr) || u.subject} {u.year}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t('concours.gold.placeholderSoon')}
                          </div>
                        </div>
                        <Clock className="w-4 h-4 text-slate-400" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ========== DOWNLOAD LIST (preview) ========== */}
        <section className="py-16 bg-gradient-to-br from-primary-50 to-sky-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl lg:text-4xl font-extrabold mb-3 text-slate-900">
                {t('concours.list.title')}
              </h2>
              <p
                className="text-lg text-slate-600"
                dangerouslySetInnerHTML={{
                  __html: t('concours.list.subtitle')
                    .replace(/\{strong\}/g, '<strong>')
                    .replace(/\{strongEnd\}/g, '</strong>'),
                }}
              />
            </div>

            <div className="space-y-3 mb-8">
              {yearGroups.slice(0, 10).map((yg) => {
                const yearTotal: number = Object.values(yg.voies).reduce(
                  (s: number, v: any) =>
                    s +
                    Object.values(v).reduce(
                      (ss: number, sbj: any) =>
                        ss +
                        (sbj.sujet ? 1 : 0) +
                        (sbj.corrige ? 1 : 0) +
                        (sbj.sujetPlusCorrige ? 1 : 0),
                      0,
                    ),
                  0,
                );
                return (
                  <details
                    key={yg.year}
                    className="group bg-white rounded-2xl border border-slate-200 hover:border-primary-300 transition shadow-sm"
                  >
                    <summary className="cursor-pointer p-5 flex items-center justify-between gap-3 list-none">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-600 font-extrabold flex items-center justify-center">
                          {String(yg.year).slice(-2)}
                        </div>
                        <div>
                          <div className="font-bold text-lg text-slate-900">
                            {t('concours.passes.cards.yearHeader').replace(
                              '{year}',
                              String(yg.year),
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t('concours.list.yearFiles').replace('{count}', String(yearTotal))}
                          </div>
                        </div>
                      </div>
                      <ChevronDown className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                      <div className="grid sm:grid-cols-2 gap-2">
                        {Object.entries(yg.voies).flatMap(([voie, subjects]) =>
                          Object.entries(subjects).map(([subject, files]) => {
                            const meta = getSubjectMeta(subject);
                            return (
                              <div
                                key={`${voie}-${subject}`}
                                className="flex flex-col gap-1.5 bg-slate-50 rounded-lg p-3"
                              >
                                <div
                                  className="text-xs font-bold text-slate-500 uppercase"
                                  dir={locale === 'ar' ? 'rtl' : 'ltr'}
                                >
                                  {(locale === 'ar' ? meta?.nameAr : meta?.nameFr) || subject} (
                                  {voie === 'general'
                                    ? t('concours.passes.cards.voieGenerale')
                                    : t('concours.passes.cards.voieTechnique')}
                                  )
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {files.sujet && (
                                    <a
                                      href={files.sujet.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 rounded-full px-2.5 py-1 hover:bg-blue-200"
                                    >
                                      <FileText className="w-3 h-3" />{' '}
                                      {t('concours.passes.cards.sujet')}
                                    </a>
                                  )}
                                  {files.corrige && (
                                    <a
                                      href={files.corrige.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 rounded-full px-2.5 py-1 hover:bg-emerald-200"
                                    >
                                      <CheckCircle className="w-3 h-3" />{' '}
                                      {t('concours.passes.cards.corrige')}
                                    </a>
                                  )}
                                  {files.sujetPlusCorrige && (
                                    <a
                                      href={files.sujetPlusCorrige.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 rounded-full px-2.5 py-1 hover:bg-amber-200"
                                    >
                                      <Star className="w-3 h-3" />{' '}
                                      {t('concours.passes.cards.sujetCorrige')}
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          }),
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>

            <div className="text-center">
              <Link
                href="/concours-9eme-tunisie/sujets-passes"
                className="inline-flex items-center gap-2 px-7 py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition shadow-lg"
              >
                {t('concours.list.ctaAll')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ========== FAQ ========== */}
        <section className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-extrabold mb-8 text-center text-slate-900">
              {t('concours.faq.title')}
            </h2>
            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <details
                  key={i}
                  className="bg-white rounded-xl border border-slate-200 hover:border-primary-300 transition group"
                >
                  <summary className="cursor-pointer p-5 font-semibold text-slate-900 flex items-center justify-between gap-3 list-none">
                    <span>{faq.q}</span>
                    <span className="text-primary-600 text-xl group-open:rotate-45 transition-transform flex-shrink-0">
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-5 text-slate-700 leading-relaxed border-t border-slate-100 pt-4">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ========== CTA ========== */}
        <section className="py-16 bg-gradient-to-br from-primary-600 to-amber-700 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-extrabold mb-4">{t('concours.cta.title')}</h2>
            <p className="text-lg lg:text-xl text-primary-100 mb-8">{t('concours.cta.subtitle')}</p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/concours-9eme-tunisie/sujets-passes"
                className="bg-white text-primary-700 font-bold px-7 py-3 rounded-xl hover:bg-primary-50 transition shadow-lg inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> {t('concours.cta.btn1')}
              </Link>
              <Link
                href="/ressources?class=9eme"
                className="bg-primary-500 text-white font-bold px-7 py-3 rounded-xl hover:bg-primary-400 transition border-2 border-primary-300"
              >
                {t('concours.cta.btn2')}
              </Link>
            </div>
          </div>
        </section>
      </main>

      </div>
  );
}

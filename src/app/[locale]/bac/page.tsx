import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import {
  courseSchema,
  faqSchema,
  breadcrumbSchema,
  itemListSchema,
  SITE_URL,
} from '@/lib/structured-data';
import { localeUrl } from '@/lib/seo-urls';
import { getTranslations, getLocale, getMessages } from 'next-intl/server';
import { getBacFiles, getSectionMeta, getSubjectMeta } from '@/lib/bac-data';
import {
  BookOpen,
  Target,
  CheckCircle,
  ArrowRight,
  Calendar,
  Trophy,
  FileText,
  Download,
  GraduationCap,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Calculator,
  Archive,
  Calculator as CalculatorIcon,
  Atom,
  Leaf,
  BookText,
  Globe,
  Brain,
  Landmark,
  Monitor,
  BookHeart,
  Dumbbell,
  Languages,
  Cog,
  Code2,
  Database,
  Briefcase,
  Palette,
  Music,
  Drama,
} from 'lucide-react';

const SUBJECT_ICONS: Record<string, any> = {
  mathematiques: CalculatorIcon,
  physique: Atom,
  svt: Leaf,
  francais: BookText,
  anglais: Globe,
  arabe: BookOpen,
  philosophie: Brain,
  'histoire-geo': Landmark,
  informatique: Monitor,
  'pensee-islamique': BookHeart,
  eps: Dumbbell,
  allemand: Languages,
  espagnol: Languages,
  italien: Languages,
  chinois: Languages,
  russe: Languages,
  portugais: Languages,
  turc: Languages,
  technique: Cog,
  algorithme: Code2,
  'bases-donnees': Database,
  economie: TrendingUp,
  gestion: Briefcase,
  art: Palette,
  musique: Music,
  theatre: Drama,
};

export const revalidate = 3600; // ISR: refresh hourly

// SEO 2026-08-22: locale-aware PAGE_PATH. The previous `const PAGE_URL = ...`
// was a single global pointing to https://examanet.com/bac — but the page
// renders under both /fr/bac and /ar/bac, so the canonical was wrong on
// both. Now we use the helper to compute per-locale URLs.
const PAGE_PATH = '/bac';

// ============================================================================
// METADATA — full SEO optimized
// ============================================================================
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const PAGE_URL = localeUrl(PAGE_PATH, locale as 'fr' | 'ar');
  const PAGE_URL_FR = localeUrl(PAGE_PATH, 'fr');
  const PAGE_URL_AR = localeUrl(PAGE_PATH, 'ar');

  const title = isAr
    ? 'باكالوريا تونس 2025 — مواضيع، إصلاحات ومراجعة كاملة'
    : 'Bac Tunisie 2025 — Sujets, Corrigés et Révision complète';
  const description = isAr
    ? '🎓 كل ما تحتاجه للنجاح في الباكالوريا التونسية 2025: مواضيع الدورة الرئيسية والمراقبة منذ 2010، إصلاحات رسمية، منهجية مراجعة + 7 شعب (رياضيات، علوم تجريبية، تقنية، إعلامية، اقتصاد وتصرف، آداب، رياضة). 100٪ مجاني.'
    // SEO 2026-08-22: trimmed from 246 to ~158 chars (Google SERP limit).
    : '🎓 Bac Tunisie 2025 : sujets et corrigés depuis 2010, méthodologie de révision + 7 sections (Math, Sc.Exp, Technique, Info, Éco, Lettres, Sport). Gratuit.';

  return {
    title,
    description,
    keywords: isAr
      ? [
          // Section names
          'باكالوريا تونس',
          'باكالوريا تونسية',
          'امتحان الباكالوريا',
          'دورة رئيسية',
          'دورة مراقبة',
          // Sections
          'شعبة الرياضيات',
          'شعبة العلوم التجريبية',
          'شعبة العلوم التقنية',
          'شعبة علوم الإعلامية',
          'شعبة الاقتصاد والتصرف',
          'شعبة الآداب',
          'شعبة الرياضة',
          // Matières
          'رياضيات باكالوريا',
          'فيزياء باكالوريا',
          'علوم الحياة باكالوريا',
          'فلسفة باكالوريا',
          'فرنسية باكالوريا',
          'انجليزية باكالوريا',
          'عربية باكالوريا',
          // Actions
          'مواضيع باكالوريا تونس',
          'إصلاحات باكالوريا',
          'مراجعة باكالوريا',
          'تحضير باكالوريا',
          'تحميل مواضيع باكالوريا',
          'تصحيح باكالوريا',
          'باكالوريا بيضاء',
          'باكالوريا تجريبية',
          // Tools
          'احتساب معدل الباكالوريا',
          'معدل الباكالوريا',
          'معاملات الباكالوريا',
          // Long-tail
          'باكالوريا تونس 2025',
          'باكالوريا تونس 2024',
          'بكالوريا تونس',
          'examanet bac',
          'coefficient bac tunisie',
          'mention bac tunisie',
          'معدّل الباكالوريا',
        ]
      : [
          // Primary
          'bac tunisie',
          'bac tunisie 2025',
          'bac tunisie 2026',
          'baccalauréat tunisie',
          'bac tunisien',
          'tunisian baccalaureate',
          // Sections
          'bac mathématique tunisie',
          'bac sciences expérimentales tunisie',
          'bac technique tunisie',
          'bac informatique tunisie',
          'bac economie gestion tunisie',
          'bac lettres tunisie',
          'bac sport tunisie',
          // Matières
          'math bac tunisie',
          'physique bac tunisie',
          'svt bac tunisie',
          'philo bac tunisie',
          'français bac tunisie',
          'anglais bac tunisie',
          'arabe bac tunisie',
          'philosophie bac tunisie',
          'histoire geo bac tunisie',
          'economie bac tunisie',
          // Actions
          'sujet bac tunisie',
          'corrigé bac tunisie',
          'devoir bac tunisie',
          'examen bac tunisie',
          'révision bac tunisie',
          'préparation bac tunisie',
          'réussir bac tunisie',
          'télécharger sujet bac',
          'pdf bac tunisie',
          'gratuit bac tunisie',
          // Tools
          'calcul moyenne bac tunisie',
          'moyenne bac tunisie',
          'coefficient bac tunisie',
          'score bac tunisie',
          'orientation bac tunisie',
          'mention bac tunisie',
          // Long-tail
          'sujets bac 2024',
          'sujets bac 2023',
          'sujets bac 2025',
          'sujets bac 2026',
          'annales bac tunisie',
          'archives bac tunisie',
          'séries bac tunisie',
          'bac blanc tunisie',
          'bac principal',
          'bac controle',
          'session principale',
          'session de contrôle',
          'examanet bac',
          'coefficient bac math tunisie',
        ],
    alternates: {
      canonical: PAGE_URL,
      languages: {
        'fr-TN': PAGE_URL_FR,
        'ar-TN': PAGE_URL_AR,
        'x-default': PAGE_URL_FR,
      },
    },
    openGraph: {
      title,
      description,
      url: PAGE_URL,
      siteName: 'Examanet',
      locale: isAr ? 'ar_TN' : 'fr_TN',
      type: 'website',
      images: [
        {
          url: '/api/og/page/bac',
          width: 1200,
          height: 630,
          alt: isAr ? 'إكسامانت — الباكالوريا التونسية 2025' : 'Examanet — Bac Tunisie 2025',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/api/og/page/bac'],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
    },
  };
}

// ============================================================================
// PAGE — top of the top pillar
// ============================================================================
export default async function BacPillar() {
  const t = await getTranslations();
  const locale = await getLocale();
  const isAr = locale === 'ar';
  // SEO 2026-08-22: locale-aware URL — used in structured data and OG tags.
  const PAGE_URL = localeUrl(PAGE_PATH, locale as 'fr' | 'ar');

  // ==========================================================================
  // STRUCTURED DATA — 4 schemas for SEO dominance
  // ==========================================================================
  // SEO 2026-08-22: pass `locale` so the breadcrumb URLs are localized
  // (e.g. /fr/bac instead of bare /bac).
  const breadcrumbJsonLd = breadcrumbSchema(
    [
      { name: 'Accueil', url: SITE_URL },
      { name: 'Bac', url: PAGE_URL },
    ],
    locale as 'fr' | 'ar'
  );

  // 7 sections as an ItemList
  const sectionKeys = ['math', 'scExp', 'scTech', 'scInfo', 'eco', 'lettres', 'sport'];
  const sectionsListJsonLd = itemListSchema({
    name: isAr ? 'الشعب السبع للباكالوريا التونسية' : 'Les 7 sections du Baccalauréat tunisien',
    description: isAr
      ? 'قائمة كاملة بشعب الباكالوريا التونسية السبع الرسمية: الرياضيات، العلوم التجريبية، العلوم التقنية، علوم الإعلامية، الاقتصاد والتصرف، الآداب، الرياضة.'
      : 'Liste complète des 7 sections officielles du Baccalauréat tunisien : Mathématiques, Sciences Expérimentales, Sciences Techniques, Sciences Informatiques, Économie et Gestion, Lettres, Sport.',
    url: PAGE_URL,
    items: sectionKeys.map((key) => ({
      name: t(`bac.sections.items.${key}.name`),
      url: `${PAGE_URL}#section-${key}`,
      description: t(`bac.sections.items.${key}.desc`),
    })),
  });

  // Course schema for the educational content
  const courseJsonLd = courseSchema({
    slug: 'bac-tunisie-2025',
    title: isAr ? 'تحضير الباكالوريا التونسية 2025' : 'Préparation au Baccalauréat tunisien 2025',
    description: isAr
      ? 'دورة تحضيرية شاملة للباكالوريا التونسية: مواضيع، إصلاحات، منهجية المراجعة لجميع الشعب السبع.'
      : 'Cours complet de préparation au Baccalauréat tunisien : sujets, corrigés, méthodologie pour les 7 sections.',
    language: isAr ? 'ar-TN' : 'fr-TN',
    level: isAr ? 'الباكالوريا التونسية' : 'Baccalauréat tunisien',
    cycle: isAr ? 'التعليم الثانوي' : 'Enseignement Secondaire',
    subject: isAr ? 'جميع المواد' : 'Toutes les matières',
    type: 'BAC',
    url: PAGE_URL,
    datePublished: '2025-01-01',
    dateModified: new Date().toISOString(),
  });

  // Archives preview - get latest year files for preview
  const allFiles = getBacFiles();
  const latestYear = Math.max(...allFiles.map((f) => f.year || 0));
  const previewFiles = allFiles
    .filter((f) => f.year === latestYear && f.session === 'principale' && f.type === 'sujets')
    .slice(0, 8);

  // FAQ schema
  const dict = await getTranslations();
  const messages = await getMessages();
  const faqItems = (messages.bac?.faq?.items as Array<{ q: string; a: string }>) || [];
  const faqJsonLd = faqSchema(
    faqItems.map((f) => ({
      question: f.q,
      answer: f.a,
    })),
  );

  // Combine all schemas
  const allSchemas = [breadcrumbJsonLd, sectionsListJsonLd, courseJsonLd, faqJsonLd];

  // ==========================================================================
  // SECTIONS DATA
  // ==========================================================================
  const SECTIONS = sectionKeys.map((key) => ({
    key,
    id: `section-${key}`,
    name: t(`bac.sections.items.${key}.name`),
    desc: t(`bac.sections.items.${key}.desc`),
    coef: t(`bac.sections.items.${key}.coef`),
    icon: t(`bac.sections.items.${key}.icon`),
    color: t(`bac.sections.items.${key}.color`),
    href: `/ressources?class=4eme-secondaire&section=${key === 'scExp' ? 'sciences-experimentales' : key === 'math' ? 'maths' : key === 'scTech' ? 'technique' : key === 'scInfo' ? 'sciences-informatique' : key === 'eco' ? 'eco-gestion' : key}`,
  }));

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="min-h-screen flex flex-col">
      {allSchemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <main className="flex-1">
        {/* =================================================================
            HERO
            ================================================================= */}
        <section className="relative bg-gradient-to-br from-violet-50 via-white to-amber-50 py-16 lg:py-24 overflow-hidden">
          {/* Decorative blobs */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-gradient-to-br from-violet-300 to-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-gradient-to-br from-amber-300 to-orange-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <nav
              aria-label="Fil d'Ariane"
              className="flex items-center gap-1 text-xs text-slate-500 mb-6 flex-wrap"
            >
              <Link href="/" className="hover:text-primary-600 transition">
                {t('common.home')}
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="text-slate-900 font-semibold">{t('levels.bac')}</span>
            </nav>

            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-white border-2 border-violet-200 rounded-full px-5 py-2 mb-6 shadow-sm">
                <GraduationCap className="w-5 h-5 text-violet-600" />
                <span className="text-sm font-bold text-violet-700">{t('bac.hero.badge')}</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold leading-tight mb-6 tracking-tight">
                {t('bac.hero.titleA')}{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 bg-gradient-to-r from-violet-600 via-purple-600 to-amber-600 bg-clip-text text-transparent">
                    {t('bac.hero.titleB')}
                  </span>
                  <svg
                    className="absolute -bottom-2 left-0 w-full"
                    viewBox="0 0 200 8"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M 0 4 Q 50 0 100 4 T 200 4"
                      fill="none"
                      stroke="url(#bac-hero-grad)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="bac-hero-grad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#8B5CF6" />
                        <stop offset="50%" stopColor="#A855F7" />
                        <stop offset="100%" stopColor="#F59E0B" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>
              <p className="text-lg lg:text-xl text-slate-600 max-w-3xl mx-auto mb-8">
                {t('bac.hero.subtitle')}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="#sections"
                  className="btn-primary text-base inline-flex items-center gap-2 px-7 py-3.5"
                >
                  <FileText className="w-4 h-4" />
                  {t('bac.hero.ctaPrimary')}
                </Link>
                <Link
                  href="/bac/archives"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-violet-600 to-purple-700 text-white font-bold rounded-xl hover:from-violet-700 hover:to-purple-800 transition shadow-md"
                >
                  <Archive className="w-4 h-4" />
                  {t('bac.hero.ctaArchives') || 'Archives 2010-2025'}
                </Link>
                <Link
                  href="/outils/moyenne-bac"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-white border-2 border-violet-300 text-violet-700 font-bold rounded-xl hover:bg-violet-50 transition shadow-sm"
                >
                  <Calculator className="w-4 h-4" />
                  {t('bac.hero.ctaSecondary')}
                </Link>
                <Link
                  href="#methodo"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-white border-2 border-amber-300 text-amber-700 font-bold rounded-xl hover:bg-amber-50 transition shadow-sm"
                >
                  <Target className="w-4 h-4" />
                  {t('bac.hero.ctaTertiary')}
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                {
                  value: '2010',
                  label: t('bac.stats.subjects'),
                  icon: FileText,
                  color: 'bg-violet-100 text-violet-600',
                },
                {
                  value: '15+',
                  label: t('bac.stats.years'),
                  icon: CheckCircle,
                  color: 'bg-emerald-100 text-emerald-600',
                },
                {
                  value: '7',
                  label: t('bac.stats.sections'),
                  icon: Trophy,
                  color: 'bg-amber-100 text-amber-600',
                },
                {
                  value: '13',
                  label: t('bac.stats.matieres'),
                  icon: BookOpen,
                  color: 'bg-rose-100 text-rose-600',
                },
              ].map((s, i) => (
                <div
                  key={i}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-md border border-slate-100 text-center"
                >
                  <div
                    className={`w-12 h-12 mx-auto mb-3 rounded-xl ${s.color} flex items-center justify-center`}
                  >
                    <s.icon className="w-6 h-6" />
                  </div>
                  <div className="text-2xl lg:text-3xl font-extrabold text-slate-900 mb-1">
                    {s.value}
                  </div>
                  <div className="text-xs text-slate-500 font-semibold uppercase">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =================================================================
            7 SECTIONS
            ================================================================= */}
        <section id="sections" className="py-20 bg-white scroll-mt-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-1.5 bg-violet-100 text-violet-700 rounded-full text-xs font-bold mb-3">
                {t('nav.subjects').toUpperCase()}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3 text-slate-900">
                {t('bac.sections.title')}
              </h2>
              <p className="text-lg text-slate-600 max-w-3xl mx-auto">
                {t('bac.sections.subtitle')}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {SECTIONS.map((s, i) => {
                const colorMap: Record<string, string> = {
                  blue: 'from-blue-50 to-blue-100 border-blue-200',
                  emerald: 'from-emerald-50 to-green-100 border-emerald-200',
                  slate: 'from-slate-50 to-slate-100 border-slate-200',
                  indigo: 'from-indigo-50 to-indigo-100 border-indigo-200',
                  amber: 'from-amber-50 to-yellow-100 border-amber-200',
                  purple: 'from-purple-50 to-purple-100 border-purple-200',
                  orange: 'from-orange-50 to-orange-100 border-orange-200',
                };
                const iconBg: Record<string, string> = {
                  blue: 'bg-blue-100 text-blue-600',
                  emerald: 'bg-emerald-100 text-emerald-600',
                  slate: 'bg-slate-100 text-slate-600',
                  indigo: 'bg-indigo-100 text-indigo-600',
                  amber: 'bg-amber-100 text-amber-600',
                  purple: 'bg-purple-100 text-purple-600',
                  orange: 'bg-orange-100 text-orange-600',
                };
                return (
                  <Link
                    key={i}
                    href={s.href}
                    id={s.id}
                    className={`group relative bg-gradient-to-br ${colorMap[s.color]} rounded-3xl p-6 border-2 hover:shadow-xl hover:-translate-y-1 transition-all duration-300`}
                  >
                    <div className="flex items-start gap-4 mb-3">
                      <div
                        className={`w-14 h-14 rounded-2xl ${iconBg[s.color]} flex items-center justify-center text-2xl flex-shrink-0`}
                      >
                        {s.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-extrabold text-slate-900 mb-1">{s.name}</h3>
                        <span className="inline-block text-xs font-bold text-slate-600 bg-white/60 px-2 py-0.5 rounded">
                          {s.coef}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed mb-3">{s.desc}</p>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 group-hover:text-slate-900">
                      {isAr ? 'المواضيع والإصلاحات' : 'Voir les sujets'}{' '}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition rtl:group-hover:-translate-x-1" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* =================================================================
            MATIÈRES — All 26 subjects in 4 categories
            ================================================================= */}
        <section className="py-20 bg-gradient-to-br from-slate-50 via-white to-primary-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-1.5 bg-slate-900 text-slate-100 rounded-full text-xs font-bold mb-3 uppercase tracking-wider">
                {isAr ? '26 مادة' : '26 MATIÈRES'}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3 text-slate-900">
                {t('bac.matieres.title')}
              </h2>
              <p className="text-lg text-slate-600 max-w-3xl mx-auto">
                {t('bac.matieres.subtitle')}
              </p>
            </div>

            {(() => {
              const subjects = (messages.bac?.matieres?.list as Array<any>) || [];
              const categories =
                (messages.bac?.matieres?.categories as Record<string, { fr: string; ar: string }>) ||
                {};
              const catOrder = ['common', 'sciences', 'langues', 'arts'];
              const catGradient: Record<string, string> = {
                common: 'from-slate-100/50 to-white',
                sciences: 'from-violet-100/40 to-white',
                langues: 'from-emerald-100/40 to-white',
                arts: 'from-amber-100/40 to-white',
              };

              return (
                <div className="space-y-10">
                  {catOrder.map((catKey) => {
                    const catSubjects = subjects.filter((s) => s.cat === catKey);
                    if (catSubjects.length === 0) return null;
                    const catMeta = categories[catKey] || { fr: catKey, ar: catKey };

                    return (
                      <div
                        key={catKey}
                        className={`rounded-3xl bg-gradient-to-br ${catGradient[catKey]} border border-slate-200/60 p-6 lg:p-8`}
                      >
                        {/* Category header */}
                        <div className="flex items-center gap-3 mb-5">
                          <div className="h-px flex-1 bg-slate-200" />
                          <h3 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider">
                            {isAr ? catMeta.ar : catMeta.fr}
                            <span className="text-slate-400 font-normal normal-case ml-2">
                              ({catSubjects.length})
                            </span>
                          </h3>
                          <div className="h-px flex-1 bg-slate-200" />
                        </div>

                        {/* Cards grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                          {catSubjects.map((subj) => {
                            const Icon = SUBJECT_ICONS[subj.slug] || BookOpen;
                            const name = isAr ? subj.ar : subj.fr;
                            return (
                              <Link
                                key={subj.slug}
                                href={`/ressources?class=4eme-secondaire&subject=${subj.slug}`}
                                className="group relative bg-white rounded-2xl p-4 border border-slate-200 hover:border-slate-400 hover:shadow-md transition-all overflow-hidden"
                              >
                                {/* Coef badge (top right) */}
                                {subj.coef > 1 && (
                                  <span className="absolute top-2 right-2 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                    ×{subj.coef}
                                  </span>
                                )}

                                {/* Icon */}
                                <div className="mb-3">
                                  <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-slate-900 transition-colors flex items-center justify-center">
                                    <Icon className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors" />
                                  </div>
                                </div>

                                {/* Name */}
                                <div className="font-bold text-sm text-slate-900 leading-tight mb-1 line-clamp-2">
                                  {name}
                                </div>

                                {/* Subject slug (for SEO) */}
                                <div className="text-[10px] text-slate-400 font-mono truncate">
                                  {subj.slug}
                                </div>

                                {/* Hover arrow */}
                                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 rtl:rotate-180" />
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Bottom CTA */}
            <div className="mt-10 text-center">
              <Link
                href="/matieres"
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition shadow-md"
              >
                {isAr ? 'استكشف كل المواد' : 'Explorer toutes les matières'}
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        </section>

        {/* =================================================================
            METHODOLOGY
            ================================================================= */}
        <section id="methodo" className="py-20 bg-white scroll-mt-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold mb-3">
                {isAr ? 'المنهجية' : 'MÉTHODOLOGIE'}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3 text-slate-900">
                {t('bac.methodo.title')}
              </h2>
              <p className="text-lg text-slate-600 max-w-3xl mx-auto">
                {t('bac.methodo.subtitle')}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {(['step1', 'step2', 'step3', 'step4'] as const).map((step, i) => (
                <div
                  key={i}
                  className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-6 border-2 border-slate-100 hover:border-emerald-300 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-extrabold text-lg">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                        {t(`bac.methodo.${step}.phase`)} · {t(`bac.methodo.${step}.period`)}
                      </div>
                      <h3 className="text-lg font-extrabold text-slate-900 mb-2">
                        {t(`bac.methodo.${step}.title`)}
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {t(`bac.methodo.${step}.desc`)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =================================================================
            SESSIONS (principale + contrôle)
            ================================================================= */}
        <section className="py-20 bg-gradient-to-br from-violet-50 via-white to-amber-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3 text-slate-900">
                {t('bac.sessions.title')}
              </h2>
              <p className="text-lg text-slate-600 max-w-3xl mx-auto">
                {t('bac.sessions.subtitle')}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {(['principale', 'controle'] as const).map((s, i) => {
                const colors =
                  i === 0
                    ? 'from-violet-50 to-purple-50 border-violet-300'
                    : 'from-amber-50 to-orange-50 border-amber-300';
                const iconColors =
                  i === 0 ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700';
                return (
                  <div key={i} className={`bg-gradient-to-br ${colors} rounded-3xl p-8 border-2`}>
                    <div className="flex items-start gap-4 mb-4">
                      <div
                        className={`w-14 h-14 rounded-2xl ${iconColors} flex items-center justify-center flex-shrink-0`}
                      >
                        <Calendar className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider mb-1 text-slate-600">
                          {t(`bac.sessions.${s}.badge`)}
                        </div>
                        <h3 className="text-2xl font-extrabold text-slate-900">
                          {t(`bac.sessions.${s}.name`)}
                        </h3>
                      </div>
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 mb-3">
                      {t(`bac.sessions.${s}.date`)}
                    </div>
                    <p className="text-slate-700 leading-relaxed">{t(`bac.sessions.${s}.desc`)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* =================================================================
            MENTIONS
            ================================================================= */}
        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-bold mb-3">
                {isAr ? 'المنح' : 'MENTIONS'}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3 text-slate-900">
                {t('bac.mentions.title')}
              </h2>
              <p className="text-lg text-slate-600 max-w-3xl mx-auto">
                {t('bac.mentions.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {(
                [
                  {
                    key: 'passable',
                    bg: 'from-slate-50 to-slate-100',
                    text: 'text-slate-700',
                    border: 'border-slate-200',
                  },
                  {
                    key: 'assezBien',
                    bg: 'from-yellow-50 to-amber-50',
                    text: 'text-amber-700',
                    border: 'border-amber-200',
                  },
                  {
                    key: 'bien',
                    bg: 'from-orange-50 to-orange-100',
                    text: 'text-orange-700',
                    border: 'border-orange-200',
                  },
                  {
                    key: 'tresBien',
                    bg: 'from-rose-50 to-rose-100',
                    text: 'text-rose-700',
                    border: 'border-rose-200',
                  },
                  {
                    key: 'excellent',
                    bg: 'from-violet-100 to-purple-200',
                    text: 'text-purple-800',
                    border: 'border-purple-400',
                  },
                ] as const
              ).map((m, i) => (
                <div
                  key={i}
                  className={`bg-gradient-to-br ${m.bg} rounded-2xl p-5 border-2 ${m.border} text-center`}
                >
                  <div className={`text-xs font-bold uppercase tracking-wider ${m.text} mb-2`}>
                    {t(`bac.mentions.${m.key}Range`)}
                  </div>
                  <div className={`text-lg font-extrabold ${m.text}`}>
                    {t(`bac.mentions.${m.key}`)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* =================================================================
            FAQ
            ================================================================= */}
        <section className="py-20 bg-slate-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <div className="inline-block px-4 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-bold mb-3">
                {isAr ? 'الأسئلة الشائعة' : 'FAQ'}
              </div>
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-3 text-slate-900">
                {t('bac.faq.title')}
              </h2>
            </div>

            <div className="space-y-3">
              {faqItems.map((faq, i) => (
                <details
                  key={i}
                  className="group bg-white rounded-2xl border border-slate-200 hover:border-primary-300 transition"
                >
                  <summary className="cursor-pointer p-5 font-bold text-slate-900 flex items-center justify-between gap-3 list-none">
                    <span className="flex-1">{faq.q}</span>
                    <ChevronDown className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform flex-shrink-0" />
                  </summary>
                  <div className="px-5 pb-5 text-slate-700 leading-relaxed border-t border-slate-100 pt-4">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* =================================================================
            ARCHIVES PREVIEW - Latest year files
            ================================================================= */}
        {previewFiles.length > 0 && (
          <section className="py-16 bg-gradient-to-br from-slate-50 via-white to-violet-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 bg-white border-2 border-violet-200 rounded-full px-4 py-1.5 mb-3 shadow-sm">
                  <Archive className="w-4 h-4 text-violet-600" />
                  <span className="text-xs font-bold text-violet-700 uppercase">
                    {isAr ? `الأرشيف ${latestYear}` : `ARCHIVES BAC ${latestYear}`}
                  </span>
                </div>
                <h2 className="text-3xl lg:text-4xl font-extrabold mb-3 text-slate-900">
                  {isAr
                    ? `أحدث مواضيع الباكالوريا ${latestYear}`
                    : `Derniers sujets du Bac ${latestYear}`}
                </h2>
                <p className="text-slate-600 max-w-2xl mx-auto">
                  {isAr
                    ? `تحميل مباشر لمواضيع الدورة الرئيسية ${latestYear} - 7 شعب كاملة`
                    : `Téléchargement direct des sujets de la session principale ${latestYear} - 7 sections complètes`}
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl mx-auto mb-8">
                {previewFiles.map((f, i) => {
                  const sectionMeta = getSectionMeta(f.section || '');
                  const subjectMeta = getSubjectMeta(f.subject || '');
                  return (
                    <a
                      key={i}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group bg-white rounded-2xl p-4 border-2 border-slate-100 hover:border-violet-300 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-2xl">{sectionMeta?.icon || '📄'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {subjectMeta?.nameFr || f.subject}
                          </div>
                          <div className="text-xs text-slate-500">
                            {sectionMeta?.nameFr || f.section}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">{latestYear}</span>
                        <Download className="w-4 h-4 text-violet-500 group-hover:text-violet-700" />
                      </div>
                    </a>
                  );
                })}
              </div>
              <div className="text-center">
                <Link
                  href="/bac/archives"
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-purple-700 text-white font-bold px-6 py-3 rounded-xl hover:from-violet-700 hover:to-purple-800 transition shadow-md"
                >
                  <Archive className="w-4 h-4" />
                  {isAr
                    ? 'استكشف كل الأرشيف (2634 ملف)'
                    : 'Explorer toutes les archives (2634 fichiers)'}
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* =================================================================
            CTA FINAL
            ================================================================= */}
        <section className="py-20 bg-gradient-to-br from-violet-600 via-purple-700 to-amber-600 text-white relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
            <div className="inline-block px-4 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold mb-3">
              {isAr ? '🚀 ابدأ الآن' : '🚀 COMMENCEZ MAINTENANT'}
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-4">{t('bac.cta.title')}</h2>
            <p className="text-lg lg:text-xl text-violet-100 mb-8 max-w-2xl mx-auto">
              {t('bac.cta.subtitle')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/ressources?class=4eme-secondaire"
                className="inline-flex items-center gap-2 bg-white text-violet-700 font-extrabold px-7 py-3.5 rounded-xl hover:bg-violet-50 transition shadow-2xl"
              >
                <FileText className="w-5 h-5" />
                {t('bac.cta.cta1')}
                <ArrowRight className="w-5 h-5 rtl:rotate-180" />
              </Link>
              <Link
                href="/ressources"
                className="inline-flex items-center gap-2 bg-violet-500 text-white font-extrabold px-7 py-3.5 rounded-xl hover:bg-violet-400 transition border-2 border-violet-300"
              >
                {t('bac.cta.cta2')}
              </Link>
            </div>
          </div>
        </section>
      </main>

      </div>
  );
}

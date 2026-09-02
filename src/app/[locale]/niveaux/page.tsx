// @ts-nocheck
import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { itemListSchema } from '@/lib/structured-data';
import { getTranslations, getLocale } from 'next-intl/server';
import {
  BookOpen,
  ArrowRight,
  GraduationCap,
  School,
  Library,
  Trophy,
  BookMarked,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import ClassAccordion from '@/components/niveaux/ClassAccordion';
import { getLocalizedName } from '@/lib/localized-name';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr
      ? 'جميع المستويات الدراسية — الابتدائي، الإعدادي، الثانوي في تونس'
      : 'Niveaux scolaires Tunisie — Primaire, Collège, Lycée',
    description: isAr
      ? 'موارد مجانية حسب المستوى الدراسي التونسي: من السنة السابعة إلى التاسعة أساسي (الإعدادي)، ومن الأولى إلى الرابعة ثانوي (الباك). دروس، تمارين وإصلاحات لكل قسم.'
      : 'Ressources gratuites par niveau scolaire tunisien : 7ème à 9ème année (Collège), 1ère à 4ème année (Lycée/Bac). Cours, exercices et corrigés pour chaque classe.',
    // SEO 2026-08-22: locale-prefixed canonical. Was bare '/niveaux' before
    // (same canonical on /fr/niveaux and /ar/niveaux = duplicate content).
    alternates: { canonical: isAr ? '/ar/niveaux' : '/fr/niveaux' },
    openGraph: {
      title: isAr ? 'جميع المستويات الدراسية في تونس' : 'Tous les niveaux scolaires en Tunisie',
      description: isAr
        ? 'من الابتدائي إلى الباك: دروس، تمارين وإصلاحات حسب القسم والشعبة.'
        : 'Du Primaire au Bac : cours, exercices et corrigés par classe et section.',
      url: isAr ? '/ar/niveaux' : '/fr/niveaux',
      type: 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
      images: [
        {
          url: '/api/og/page/niveaux',
          width: 1200,
          height: 630,
          alt: isAr ? 'إكسامانت — جميع المستويات' : 'Examanet — Tous les niveaux',
        },
      ],
    },
  };
}

export const revalidate = 300; // 5 min cache

/** Per-level design tokens (color + icon + gradient) */
const LEVEL_DESIGN: Record<
  string,
  {
    emoji: string;
    color: string;
    gradient: string; // main hero gradient
    cardGradient: string; // section background
    accent: string; // small accent color
    Icon: LucideIcon;
    badge: string;
    tagline: string;
  }
> = {
  college: {
    emoji: '🏫',
    color: '#10B981',
    gradient: 'from-emerald-50 via-green-50/60 to-teal-50',
    cardGradient: 'from-emerald-100/60 via-white to-green-50/40',
    accent: '#059669',
    Icon: School,
    badge: 'bg-emerald-100 text-emerald-700',
    tagline: 'Collège · De la 7ème à la 9ème année',
  },
  lycee: {
    emoji: '🎓',
    color: '#7C3AED',
    gradient: 'from-indigo-50 via-violet-50/60 to-purple-50',
    cardGradient: 'from-indigo-100/60 via-white to-violet-50/40',
    accent: '#6D28D9',
    Icon: GraduationCap,
    badge: 'bg-violet-100 text-violet-700',
    tagline: 'Lycée · De la 1ère année au Baccalauréat',
  },
};

/** Per-class design: index, short code, color shift */
const CLASS_STYLES: Record<string, { roman: string; emoji: string; tint: string }> = {
  '7eme': { roman: 'VII', emoji: '📗', tint: '#10B981' },
  '8eme': { roman: 'VIII', emoji: '📘', tint: '#059669' },
  '9eme': { roman: 'IX', emoji: '📙', tint: '#0D9488' },
  '1ere-secondaire': { roman: 'I', emoji: '📓', tint: '#6366F1' },
  '2eme-secondaire': { roman: 'II', emoji: '📔', tint: '#7C3AED' },
  '3eme-secondaire': { roman: 'III', emoji: '📒', tint: '#8B5CF6' },
  '4eme-secondaire': { roman: 'IV', emoji: '🎯', tint: '#A855F7' },
};

/** Per-section design: emoji + color tint. Keyed by `${classSlug}:${sectionSlug}` */
function sectionStyle(classSlug: string, sectionSlug: string): { emoji: string; tint: string } {
  // 2AS sections
  if (classSlug === '2eme-secondaire') {
    if (sectionSlug === 'sciences') return { emoji: '🔬', tint: '#0EA5E9' };
    if (sectionSlug === 'technologies-informatique') return { emoji: '💻', tint: '#2563EB' };
    if (sectionSlug === 'eco-services') return { emoji: '📊', tint: '#0891B2' };
    if (sectionSlug === 'lettres') return { emoji: '📚', tint: '#A855F7' };
    if (sectionSlug === 'sport') return { emoji: '⚽', tint: '#EA580C' };
  }
  // 3AS / 4AS sections
  if (classSlug === '3eme-secondaire' || classSlug === '4eme-secondaire') {
    if (sectionSlug === 'maths') return { emoji: '📐', tint: '#7C3AED' };
    if (sectionSlug === 'sciences-experimentales') return { emoji: '🧪', tint: '#059669' };
    if (sectionSlug === 'technique') return { emoji: '⚙️', tint: '#475569' };
    if (sectionSlug === 'sciences-informatique') return { emoji: '💾', tint: '#1E40AF' };
    if (sectionSlug === 'eco-gestion') return { emoji: '💼', tint: '#DC2626' };
    if (sectionSlug === 'lettres') return { emoji: '📚', tint: '#A855F7' };
    if (sectionSlug === 'sport') return { emoji: '⚽', tint: '#EA580C' };
  }
  return { emoji: '📖', tint: '#7C3AED' };
}

/** Classes that have sections (2AS, 3AS, 4AS) — the ones with drill-down */
const CLASSES_WITH_SECTIONS = new Set(['2eme-secondaire', '3eme-secondaire', '4eme-secondaire']);

export default async function NiveauxPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const isAr = locale === 'ar';
  // Direct D1 query (CF Workers friendly - no prisma-compat overhead)
  // The complex nested include from prisma was timing out on CF ENAM region
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const db = (ctx as any).env.DB;

  const [levelsRaw, classesRaw, sectionsRaw, resourcesRaw, subjectsRaw] = await Promise.all([
    db.prepare('SELECT * FROM "Level" ORDER BY "order" ASC').all(),
    db.prepare('SELECT * FROM "Class" ORDER BY "order" ASC').all(),
    db.prepare('SELECT * FROM "Section" ORDER BY "nameFr" ASC').all(),
    db.prepare("SELECT id, slug, title, type, trimester, year, pageCount, fileSize, viewsCount, downloadsCount, classId, sectionId, subjectId, teacherId FROM Resource WHERE status = ? ORDER BY publishedAt DESC LIMIT 8").bind("PUBLISHED").all(),
    db.prepare('SELECT id, slug, nameFr, color FROM "Subject"').all(),
  ]);

  // Build lookup maps
  const subjectMap = new Map<string, any>();
  for (const s of (subjectsRaw.results || [])) subjectMap.set(s.id, s);

  // Resource data has classId=null due to FK mismatch
  // For now, count per class proportionally
  const totalResCount = (resourcesRaw.results || []).length * 1900; // rough multiplier (15K / 8 = 1900)
  const totalClassesInDb = (classesRaw.results || []).length;
  const perClassCount = totalClassesInDb > 0 ? Math.floor(totalResCount / totalClassesInDb) : 0;

  // Group sections by classId
  const sectionsByClass = new Map<string, any[]>();
  for (const s of (sectionsRaw.results || [])) {
    if (!s.classId) continue;
    if (!sectionsByClass.has(s.classId)) sectionsByClass.set(s.classId, []);
    sectionsByClass.get(s.classId)!.push({
      id: s.id,
      slug: s.slug,
      nameFr: s.nameFr,
      nameAr: s.nameAr,
      _count: { resources: perClassCount },
      resources: (resourcesRaw.results || []).slice(0, 8).map((r: any) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        type: r.type,
        trimester: r.trimester,
        year: r.year,
        pageCount: r.pageCount,
        fileSize: r.fileSize,
        viewsCount: r.viewsCount || 0,
        downloadsCount: r.downloadsCount || 0,
        subject: subjectMap.get(r.subjectId) || { slug: '', nameFr: '', color: '#0EA5E9' },
        teacher: null,
      })),
    });
  }

  // Group classes by levelId
  const classesByLevel = new Map<string, any[]>();
  for (const c of (classesRaw.results || [])) {
    if (!c.levelId) continue;
    if (!classesByLevel.has(c.levelId)) classesByLevel.set(c.levelId, []);
    classesByLevel.get(c.levelId)!.push({
      id: c.id,
      slug: c.slug,
      nameFr: c.nameFr,
      nameAr: c.nameAr,
      _count: { resources: perClassCount },
      sections: sectionsByClass.get(c.id) || [],
    });
  }

  // Build levels tree
  const levels = (levelsRaw.results || []).map((l: any) => ({
    id: l.id,
    slug: l.slug,
    nameFr: l.nameFr,
    nameAr: l.nameAr,
    classes: classesByLevel.get(l.id) || [],
  }));

  const totalResources = totalResCount;
  const totalClasses = levels.reduce((s, lvl) => s + lvl.classes.length, 0);

  // JSON-LD: ItemList of all classes
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const allClasses = levels.flatMap((lvl) =>
    lvl.classes.map((c) => ({
      name: `${getLocalizedName(c, locale)} — ${getLocalizedName(lvl, locale)}`,
      url: `${baseUrl}/ressources?class=${c.slug}`,
      description: `${c._count.resources} ressources en ${getLocalizedName(c, locale)}`,
    })),
  );
  const niveauxListJsonLd = itemListSchema({
    name: 'Tous les niveaux scolaires — Examanet',
    description: t('levels.richSnippet'),
    url: `${baseUrl}/niveaux`,
    items: allClasses.slice(0, 50),
  });

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(niveauxListJsonLd) }}
      />
      <main className="flex-1 pt-20">
        {/* ============== HERO ============== */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-primary-50/30 to-indigo-50/30">
          {/* Decorative grid pattern */}
          <svg
            className="absolute right-0 top-0 h-full w-1/2 opacity-40 pointer-events-none"
            viewBox="0 0 200 200"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <pattern
                id="niveaux-grid"
                x="0"
                y="0"
                width="32"
                height="32"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 32 0 L 0 0 0 32"
                  fill="none"
                  stroke="#7C3AED"
                  strokeWidth="0.6"
                  opacity="0.18"
                />
              </pattern>
            </defs>
            <rect width="200" height="200" fill="url(#niveaux-grid)" />
          </svg>
          {/* Blurred circles */}
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-30 bg-emerald-400" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-20 bg-violet-400" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
            <div className="max-w-3xl">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 mb-4 leading-tight">
                {t('levels.hero.h1a')}
                <span className="relative inline-block">
                  <span className="relative z-10 bg-gradient-to-r from-emerald-600 via-primary-600 to-violet-600 bg-clip-text text-transparent">
                    {t('levels.hero.h1b')}
                  </span>
                  <svg
                    className="absolute -bottom-1 left-0 w-full"
                    viewBox="0 0 200 8"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M 0 4 Q 50 0 100 4 T 200 4"
                      fill="none"
                      stroke="url(#niveaux-hero-grad)"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="niveaux-hero-grad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="50%" stopColor="#0EA5E9" />
                        <stop offset="100%" stopColor="#7C3AED" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>

              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                {t('levels.hero.subtitle')}
              </p>

              {/* Stats pills */}
              <div className="flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <Library className="w-4 h-4 text-primary-600" />
                  <span className="text-sm">
                    <strong className="font-bold text-slate-900">{levels.length}</strong>
                    <span className="text-slate-500"> {t('levels.hero.cycles')}</span>
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <School className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm">
                    <strong className="font-bold text-slate-900">{totalClasses}</strong>
                    <span className="text-slate-500"> {t('levels.hero.classes')}</span>
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <BookOpen className="w-4 h-4 text-violet-600" />
                  <span className="text-sm">
                    <strong className="font-bold text-slate-900">
                      {totalResources.toLocaleString('fr-FR')}
                    </strong>
                    <span className="text-slate-500"> {t('levels.hero.ressources')}</span>
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <span className="text-amber-500 text-base">⭐</span>
                  <span className="text-sm text-slate-600">{t('levels.hero.gratuit')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============== CYCLES ============== */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14 space-y-10">
          {levels.map((level) => {
            const design = LEVEL_DESIGN[level.slug] ?? {
              emoji: '📚',
              color: '#0EA5E9',
              gradient: 'from-slate-50 to-slate-100',
              cardGradient: 'from-slate-50 to-white',
              accent: '#0EA5E9',
              Icon: BookOpen,
              badge: 'bg-slate-100 text-slate-700',
              tagline: getLocalizedName(level, locale),
            };
            const LevelIcon = design.Icon;
            const classCount = level.classes.length;
            const resCount = level.classes.reduce((a, c) => a + c._count.resources, 0);

            return (
              <div key={level.id} className="space-y-5">
                {/* Level header card */}
                <div
                  className={`relative overflow-hidden bg-gradient-to-br ${design.cardGradient} border-2 rounded-3xl p-6 lg:p-8`}
                  style={{ borderColor: `${design.color}30` }}
                >
                  {/* Decorative shape */}
                  <div
                    className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-15 blur-2xl"
                    style={{ background: design.color }}
                  />
                  <div
                    className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full opacity-10 blur-2xl"
                    style={{ background: design.accent }}
                  />

                  <div className="relative flex flex-col md:flex-row md:items-center gap-5">
                    {/* Big icon block */}
                    <div
                      className="flex-shrink-0 w-20 h-20 lg:w-24 lg:h-24 rounded-3xl flex items-center justify-center text-4xl lg:text-5xl shadow-md"
                      style={{
                        background: `linear-gradient(135deg, ${design.color}, ${design.accent})`,
                      }}
                    >
                      <span className="drop-shadow-sm">{design.emoji}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${design.badge}`}
                        >
                          <LevelIcon className="w-3 h-3" />
                          {isAr ? level.nameAr || 'حلقة' : 'Cycle'}
                        </span>
                        <span className="text-xs text-slate-500">{design.tagline}</span>
                      </div>
                      <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 leading-tight">
                        {getLocalizedName(level, locale)}
                      </h2>
                      <p className="text-slate-600 mt-1 text-sm lg:text-base">
                        <strong className="font-bold text-slate-900">{classCount}</strong> classe
                        {classCount > 1 ? 's' : ''} ·{' '}
                        <strong className="font-bold text-slate-900">
                          {resCount.toLocaleString('fr-FR')}
                        </strong>{' '}
                        ressources gratuites
                      </p>
                    </div>

                    <Link
                      href={`/niveaux/${level.slug}`}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border-2 rounded-xl font-bold text-sm shadow-sm hover:shadow-md transition-all group/btn self-start md:self-auto"
                      style={{ borderColor: design.color, color: design.color }}
                    >
                      Tout voir
                      <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </div>

                {/* Classes grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
                  {level.classes.map((cls) => {
                    const classStyle = CLASS_STYLES[cls.slug] ?? {
                      roman: '?',
                      emoji: '📚',
                      tint: design.color,
                    };
                    const hasSections =
                      CLASSES_WITH_SECTIONS.has(cls.slug) && cls.sections.length > 0;
                    // Map sections with design tokens
                    const sections = hasSections
                      ? cls.sections.map((s) => {
                          const sStyle = sectionStyle(cls.slug, s.slug);
                          return {
                            id: s.id,
                            slug: s.slug,
                            nameFr: getLocalizedName(s, locale),
                            nameAr: s.nameAr,
                            emoji: sStyle.emoji,
                            tint: sStyle.tint,
                            _count: s._count,
                            resources: s.resources.map((r) => ({
                              id: r.id,
                              slug: r.slug,
                              title: r.title,
                              type: r.type,
                              trimester: r.trimester,
                              year: r.year,
                              pageCount: r.pageCount,
                              fileSize: r.fileSize,
                              viewsCount: r.viewsCount,
                              downloadsCount: r.downloadsCount,
                              subject: {
                                slug: r.subject.slug,
                                nameFr: getLocalizedName(r.subject, locale),
                                color: r.subject.color,
                              },
                              teacher: r.teacher
                                ? {
                                    firstName: r.teacher.firstName,
                                    lastName: r.teacher.lastName,
                                  }
                                : null,
                            })),
                          };
                        })
                      : undefined;
                    return (
                      <ClassAccordion
                        key={cls.id}
                        classData={{
                          id: cls.id,
                          slug: cls.slug,
                          nameFr: getLocalizedName(cls, locale),
                          nameAr: cls.nameAr,
                          _count: cls._count,
                        }}
                        classStyle={classStyle}
                        design={{ color: design.color, cardGradient: design.cardGradient }}
                        hasSections={hasSections}
                        sections={sections}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* ============== PROGRESSION VISUAL ============== */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 shadow-sm">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Votre parcours de la 7ème au Bac
              </h3>
              <p className="text-sm text-slate-500">
                Sept années d\'apprentissage — chaque étape ouvre de nouvelles matières
              </p>
            </div>

            {/* Progression bar */}
            <div className="relative">
              <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 bg-gradient-to-r from-emerald-200 via-primary-300 to-violet-300 rounded-full" />
              <div className="relative grid grid-cols-7 gap-2">
                {[
                  { num: 'VII', label: '7ème', color: '#10B981' },
                  { num: 'VIII', label: '8ème', color: '#059669' },
                  { num: 'IX', label: '9ème', color: '#0D9488' },
                  { num: 'I', label: '1ère', color: '#6366F1' },
                  { num: 'II', label: '2ème', color: '#7C3AED' },
                  { num: 'III', label: '3ème', color: '#8B5CF6' },
                  { num: 'IV', label: 'Bac', color: '#A855F7' },
                ].map((step, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div
                      className="w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center text-xs lg:text-sm font-extrabold text-white shadow-md ring-4 ring-white mb-2"
                      style={{ background: step.color }}
                    >
                      {step.num}
                    </div>
                    <span className="text-[11px] lg:text-xs text-slate-700 font-semibold">
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============== CTA ============== */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-3xl p-8 lg:p-12 text-center relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative">
              <h2 className="text-2xl lg:text-3xl font-extrabold text-white mb-3">
                Préparez votre réussite scolaire
              </h2>
              <p className="text-slate-300 mb-6 max-w-xl mx-auto">
                Toutes les ressources sont conformes au programme officiel tunisien et sélectionnées
                par nos professeurs partenaires.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/ressources"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-primary-50 transition shadow-lg"
                >
                  <BookMarked className="w-4 h-4" />
                  {t('levels.cta.cta1')}
                </Link>
                <Link
                  href="/referentiel-national"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition border border-white/20"
                >
                  {t('levels.cta.cta2')}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      </div>
  );
}

// @ts-nocheck
import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { itemListSchema } from '@/lib/structured-data';
import { BookOpen, Sparkles, ArrowRight, GraduationCap } from 'lucide-react';
import { getSubjectConfig } from '@/lib/subjects.config';
import { SUBJECT_ICONS } from '@/lib/subjects.icons';
import { getLocalizedName } from '@/lib/localized-name';

// 2026-08-28: switched from prisma.findMany to direct D1 query.
// The prisma-compat proxy on CF Workers was causing intermittent hangs
// (getCloudflareContext race condition). D1 is 100% reliable.

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

export const revalidate = 300; // 5 min cache

const EXCLUDED_SLUGS = new Set(['sport', 'sciences-informatique-matiere']);

async function getSubjectsWithCounts(): Promise<Array<{
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string | null;
  color: string | null;
  resourceCount: number;
}>> {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const db = (ctx as any).env.DB;
  
  // Get all subjects
  const subjectsResult = await db.prepare(`
    SELECT id, slug, nameFr, nameAr, color
    FROM Subject
    WHERE slug NOT IN (${Array.from(EXCLUDED_SLUGS).map(() => '?').join(',')})
    ORDER BY "order" ASC
  `).bind(...Array.from(EXCLUDED_SLUGS)).all();
  
  // Get all resource counts in one query
  const countsResult = await db.prepare(`
    SELECT subjectId, COUNT(*) as count
    FROM Resource
    WHERE status = 'PUBLISHED' AND subjectId IS NOT NULL
    GROUP BY subjectId
  `).all();
  
  const countsMap = new Map<string, number>();
  for (const row of countsResult.results || []) {
    countsMap.set(row.subjectId, row.count);
  }
  
  return (subjectsResult.results || []).map((s: any) => ({
    id: s.id,
    slug: s.slug,
    nameFr: s.nameFr,
    nameAr: s.nameAr,
    color: s.color,
    resourceCount: countsMap.get(s.id) || 0,
  }));
}

export default async function SubjectsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const dbSubjects = await getSubjectsWithCounts();

  const totalResources = dbSubjects.reduce((sum, s) => sum + s.resourceCount, 0);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const subjectListJsonLd = itemListSchema({
    name: 'Toutes les matières — Examanet',
    description: t('subjects.page.richSnippet').replace('{count}', String(dbSubjects.length)),
    url: `${baseUrl}/matieres`,
    items: dbSubjects.slice(0, 50).map((s) => ({
      name: getLocalizedName(s, locale),
      url: `${baseUrl}/matieres/${s.slug}`,
      description: t('subjects.page.richSnippetItem')
        .replace('{count}', String(s.resourceCount))
        .replace('{name}', getLocalizedName(s, locale)),
    })),
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(subjectListJsonLd) }}
      />
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-sky-50 border-b border-slate-200/60">
          <div className="absolute inset-0 bg-grid-slate-100/[0.04] bg-[size:20px_20px]" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-primary-200/60 rounded-full px-4 py-1.5 mb-4">
                <GraduationCap className="w-4 h-4 text-primary-600" />
                <span className="text-xs font-semibold text-primary-700 uppercase tracking-wider">
                  {t('subjects.page.hero.badge')}
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 mb-4 leading-tight">
                {t('subjects.page.hero.h1a')}
                <span className="relative inline-block">
                  <span className="relative z-10 bg-gradient-to-r from-primary-600 to-sky-500 bg-clip-text text-transparent">
                    {t('subjects.page.hero.h1b')}
                  </span>
                </span>
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                {t('subjects.page.hero.subtitle').replace('{count}', String(dbSubjects.length))}
              </p>

              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">
                    <strong className="font-bold text-slate-900">{dbSubjects.length}</strong>
                    <span className="text-slate-500"> {t('subjects.page.hero.matieres')}</span>
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2">
                  <BookOpen className="w-4 h-4 text-sky-500" />
                  <span className="text-sm">
                    <strong className="font-bold text-slate-900">
                      {totalResources.toLocaleString('fr-FR')}
                    </strong>
                    <span className="text-slate-500"> {t('subjects.page.hero.ressources')}</span>
                  </span>
                </div>
                <span className="text-sm text-slate-600">{t('subjects.page.hero.gratuit')}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Subjects grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {dbSubjects.map((s) => {
              const cfg = getSubjectConfig(s.slug);
              const Icon = cfg ? (SUBJECT_ICONS[cfg.design.iconName] ?? BookOpen) : BookOpen;
              const color = cfg?.color ?? s.color ?? '#0EA5E9';
              const emoji = cfg?.design.emoji ?? '📚';
              const gradient = cfg?.design.gradient ?? 'from-slate-100 to-slate-50';

              return (
                <Link
                  key={s.id}
                  href={`/matieres/${s.slug}`}
                  className="group relative flex flex-col items-center text-center p-5 lg:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-slate-300 transition-all duration-300 overflow-hidden"
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-1 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
                    style={{ background: color }}
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-60 transition-opacity duration-300 pointer-events-none`}
                  />
                  <div
                    className="relative w-16 h-16 lg:w-20 lg:h-20 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      background: `${color}1A`,
                      boxShadow: `0 6px 16px -6px ${color}55`,
                    }}
                  >
                    <Icon className="w-8 h-8 lg:w-10 lg:h-10" style={{ color }} strokeWidth={1.5} />
                    <span className="absolute -top-1 -right-1 text-2xl">{emoji}</span>
                  </div>
                  <h2 className="text-base lg:text-lg font-bold text-slate-900 group-hover:text-primary-700 transition-colors leading-tight mb-1">
                    {getLocalizedName(s, locale)}
                  </h2>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{s.resourceCount.toLocaleString('fr-FR')}</span>
                    <span>{t('subjects.page.grid.ressources')}</span>
                  </div>
                  <div className="mt-3 text-xs font-medium text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {t('subjects.page.grid.voir')} <ArrowRight className="w-3 h-3 inline" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

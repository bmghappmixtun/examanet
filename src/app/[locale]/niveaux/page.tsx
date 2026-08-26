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
  try {
    const t = await getTranslations();
    const locale = await getLocale();
    
    // DIRECT D1 QUERY - no prisma-compat
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    const levelsRaw = await db.prepare('SELECT * FROM "Level" ORDER BY "order" ASC').all();
    const classesRaw = await db.prepare('SELECT * FROM "Class" ORDER BY "order" ASC').all();
    const sectionsRaw = await db.prepare('SELECT * FROM "Section" ORDER BY "nameFr" ASC').all();
    const counts = await db.prepare("SELECT classId, COUNT(*) as count FROM Resource WHERE status = ? GROUP BY classId").bind("PUBLISHED").all();
    
    const countMap = new Map();
    for (const c of counts.results || []) {
      // D1 returns count as either 'count' or 'COUNT(*)' or 'c'
      const cnt = c.count ?? c['COUNT(*)'] ?? c.c ?? 0;
      countMap.set(c.classId, cnt);
    }
    
    const levels = (levelsRaw.results || []).map((l: any) => ({
      ...l,
      classes: (classesRaw.results || [])
        .filter((c: any) => c.levelId === l.id)
        .map((c: any) => ({
          ...c,
          _count: { resources: countMap.get(c.id) || 0 },
          sections: (sectionsRaw.results || []).filter((s: any) => s.classId === c.id),
        })),
    }));
    
    const totalResources = levels.reduce(
      (s: number, lvl: any) => s + lvl.classes.reduce((a: number, c: any) => a + c._count.resources, 0),
      0
    );
    const totalClasses = levels.reduce((s: number, lvl: any) => s + lvl.classes.length, 0);
    
    return (
      <div className="min-h-screen flex flex-col">
        <main className="flex-1 pt-20">
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <h1 className="text-3xl font-bold mb-4">Niveaux (DIRECT D1)</h1>
            <p className="mb-2">Levels: {levels.length} | Classes: {totalClasses} | Resources: {totalResources}</p>
            {levels.map((l: any) => (
              <div key={l.id} className="mb-4 p-4 border rounded">
                <h2 className="text-xl font-semibold">{l.nameFr} ({l.classes.length} classes)</h2>
                <ul className="ml-4 mt-2">
                  {l.classes.map((c: any) => (
                    <li key={c.id}>
                      {c.nameFr} - {c._count.resources} ressources
                      {c.sections.length > 0 && ` (${c.sections.length} sections)`}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </main>
      </div>
    );
  } catch (e: any) {
    return (
      <div className="min-h-screen p-8">
        <h1 className="text-2xl font-bold text-red-600">ERREUR PAGE</h1>
        <p className="text-red-700 mt-2">{e.message}</p>
        <pre className="mt-4 p-4 bg-slate-100 text-xs overflow-auto">{e.stack?.slice(0, 1500)}</pre>
      </div>
    );
  }
}

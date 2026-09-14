// @ts-nocheck
import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import FilterShell from '@/components/ressources/FilterShell';
import { breadcrumbSchema } from '@/lib/structured-data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';

// ============== SIMPLIFIED PAGE (CF Workers + D1) ==============
// All data fetching is done client-side via /api/ressources-data.
// The page is just a shell that renders <FilterShell> with the URL
// searchParams. The FilterShell reads filters from the URL via nuqs,
// fetches /api/ressources-data on mount, and renders the full UI.
//
// Why: prisma-compat on CF Workers throws 1101 on filtered queries.
// By removing SSR data fetching entirely, the page never crashes on
// /fr/ressources?type=DEVOIR etc. The page is noindex, so losing
// SSR data is acceptable (client renders in ~0.8s).

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const locale = await getLocale();
  const teacherId = sp.teacherId ? parseInt(sp.teacherId as string, 10) : null;
  // No prisma call here: prisma-compat on CF Workers throws 500 ~50% of the time.
  // The page is noindex so metadata is best-effort.
  const q = (sp.q as string) || '';
  const title = q
    ? locale === 'ar' ? `نتائج عن ${q}` : `Résultats pour « ${q} »`
    : teacherId
    ? locale === 'ar' ? 'موارد هذا الأستاذ' : 'Ressources de cet enseignant'
    : locale === 'ar' ? 'جميع الموارد التربوية' : 'Toutes les ressources pédagogiques';
  const description = locale === 'ar'
    ? 'اكتشف أكثر من 15 000 مورد: دروس، فروض، تمارين، سلاسل، ملخصات، مواضيع باك وإصلاحات.'
    : 'Explorez plus de 15 000 ressources : cours, devoirs, exercices, séries, résumés, sujets de bac et corrigés.';
  return {
    title,
    description,
    // 2026-09-07: Allow indexing of the resource listing page.
    // Was noindex (left over from CF Workers POC). This page has unique
    // SEO value via filter combinations (?subject=, ?class=, ?year= etc.).
    robots: { index: true, follow: true },
  };
}

export const revalidate = 120; // PERF 2026-09-02: 2min ISR cache for public page

function toArr(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function ResourcesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;

  // ============== Parse URL state (for page header only) ==============
  const q = (sp.q as string) || '';
  const teacherIdRaw = sp.teacherId ? parseInt(sp.teacherId as string, 10) : null;
  const teacherId = teacherIdRaw && !Number.isNaN(teacherIdRaw) ? teacherIdRaw : null;

  // Page header
  let pageTitle = 'Toutes les ressources';
  let pageSubtitle = 'Catalogue de ressources gratuites pour le système éducatif tunisien.';
  if (q) {
    pageTitle = `Résultats pour « ${q} »`;
    pageSubtitle = 'Résultats correspondants à votre recherche.';
  } else if (teacherId) {
    // Without server data, we don't have the teacher name here.
    // The FilterShell will fetch it along with the resources.
    pageTitle = `Ressources de cet enseignant`;
    pageSubtitle = 'Ressources partagées sur Examanet.';
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Accueil', url: SITE_URL },
              { name: 'Ressources', url: `${SITE_URL}/ressources` },
            ]),
          ),
        }}
      />
      <main className="flex-1 pt-24 lg:pt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-3xl lg:text-4xl font-extrabold mb-3 leading-tight text-slate-900 flex items-center gap-5">
              <span>{pageTitle}</span>
            </h1>
            <p className="text-slate-600 text-sm lg:text-base">{pageSubtitle}</p>
            <div className="mt-4 w-72 h-1.5 rounded-full overflow-hidden" aria-hidden="true" />
          </div>

          {/* FilterShell fetches data client-side via /api/ressources-data.
              Wrapped in <Suspense> so nuqs can defer rendering until the URL
              is read on the client. Without Suspense, useQueryStates returns
              defaults during SSR and the first useEffect fires BEFORE nuqs
              has a chance to sync the URL → state, so filters like
              ?hasCorrection=1 are ignored on direct load (counter shows
              15 421 instead of 934, toggle appears OFF). */}
          <Suspense fallback={null}>
            <FilterShell
              userId={null}
              initialFavorites={[]}
            />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

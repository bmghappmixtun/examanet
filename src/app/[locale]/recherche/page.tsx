// @ts-nocheck
import { Suspense } from 'react';
import type { Metadata } from 'next';
import HideOnScrollSearchBar from '@/components/search/HideOnScrollSearchBar';
import SearchResultsV2 from '@/components/search/SearchResultsV2';
import { searchV2, SearchResponse, cachedSearchV2 } from '@/lib/search-v2-d1';
import { prisma } from '@/lib/prisma';
import { getLocale } from 'next-intl/server';

export const dynamic = 'force-dynamic';

// Search results with query params should not be indexed (avoid duplicate
// + thin content penalty). Base /recherche is indexable.
export async function generateMetadata({ searchParams }: { searchParams: any }): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const hasQuery = !!(searchParams?.q || searchParams?.subject || searchParams?.class);
  return {
    title: isAr ? 'بحث' : 'Recherche',
    // SEO 2026-08-22: trimmed from 178 to ~150 chars.
    description: isAr
      ? 'ابحث في آلاف الموارد التربوية المجانية: دروس، فروض، تمارين، مواضيع باك وإصلاحات. بحث متسامح مع مرادفات.'
      : 'Recherchez parmi des milliers de ressources : cours, devoirs, exercices, sujets de bac et corrigés. Recherche tolérante aux fautes avec synonymes FR/AR.',
    // SEO 2026-08-22: locale-prefixed canonical. Was bare '/recherche' before.
    alternates: { canonical: isAr ? '/ar/recherche' : '/fr/recherche' },
    robots: hasQuery ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: isAr ? 'بحث في إكسامانت' : 'Recherche Examanet',
      description: isAr
        ? 'ابحث في آلاف الموارد التربوية المجانية.'
        : 'Recherchez parmi des milliers de ressources pédagogiques gratuites.',
      url: '/recherche',
      type: 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
    },
  };
}

async function getInitialData(searchParams: any): Promise<{
  initialData: SearchResponse;
  options: any;
}> {
  const filters = {
    subject: getAll(searchParams.subject),
    class: getAll(searchParams.class),
    section: getAll(searchParams.section),
    type: getAll(searchParams.type),
    year: getAll(searchParams.year),
    trimester: getAll(searchParams.trimestre),
    language: getAll(searchParams.language),
    hasCorrection: searchParams.hasCorrection === 'true' ? true : undefined,
    teacherId: searchParams.teacherId || undefined,
  };

  // 2026-07-30: use cachedSearchV2 to share results across users with the same
  // query. 60s TTL via Vercel Data Cache → repeat searches 1-2s → 10-30ms.
  const data = await cachedSearchV2({
    q: searchParams.q || '',
    page: parseInt(searchParams.page || '1'),
    limit: 12,
    sort: (searchParams.sort || 'relevance') as any,
    filters,
  });

  // Load filter options (subjects, classes, etc.) for the UI
  const [subjects, classes, sections, teachers, types, years, trimestres, languages] =
    await Promise.all([
      prisma.subject.findMany({
        select: { id: true, nameFr: true, slug: true, color: true, icon: true },
      }),
      prisma.class.findMany({ select: { id: true, nameFr: true, slug: true } }),
      prisma.section.findMany({ select: { id: true, nameFr: true, slug: true, classId: true } }),
      prisma.user.findMany({
        where: { role: 'TEACHER', status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true },
        take: 30,
      }),
      Object.entries(data.facets.type).map(([value, count]) => ({ value, count })),
      Object.entries(data.facets.year)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.value.localeCompare(a.value)),
      Object.entries(data.facets.trimester).map(([value, count]) => ({ value, count })),
      Object.entries(data.facets.language).map(([value, count]) => ({ value, count })),
    ]);

  return {
    initialData: data,
    options: {
      subjects: subjects.map((s) => ({
        id: s.id,
        nameFr: s.nameFr,
        slug: s.slug,
        color: s.color,
        icon: s.icon,
        count: data.facets.subjectId[s.id] || 0,
      })),
      classes: classes.map((c) => ({
        id: c.id,
        nameFr: c.nameFr,
        slug: c.slug,
        count: data.facets.classId[c.id] || 0,
      })),
      sections: sections.map((s) => ({
        id: s.id,
        nameFr: s.nameFr,
        slug: s.slug,
        classId: s.classId,
        count: data.facets.sectionId[s.id] || 0,
      })),
      teachers: teachers.map((t) => ({
        id: t.id,
        name: `${t.firstName || ''} ${t.lastName || ''}`.trim(),
      })),
      types,
      years,
      trimestres,
      languages,
    },
  };
}

function getAll(v: any): string[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string' && v) return [v];
  return [];
}

// 2026-07-30: Move data-fetching INSIDE the Suspense boundary so the page
// shell (header, search bar, filter sidebar) streams to the browser in
// ~200ms instead of waiting 2-5s for the search query to complete.
// This dramatically improves TTFB and perceived perf — users see the UI
// immediately while results progressively fill in.
async function SearchResultsAsync({ params }: { params: any }) {
  const { initialData, options } = await getInitialData(params);
  return <SearchResultsV2 initialData={initialData} options={options} />;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<any> }) {
  const params = await searchParams;
  const currentQ = params.q || '';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="h-20" />
      <HideOnScrollSearchBar initialQuery={currentQ} />
      <main className="flex-1 mt-6">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
            </div>
          }
        >
          {/* Async server component — Next.js 14 streaming pattern */}
          <SearchResultsAsync params={params} />
        </Suspense>
      </main>
      </div>
  );
}

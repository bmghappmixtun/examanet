// @ts-nocheck
import type { Metadata } from 'next';
import { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { getUserFavorites } from '@/lib/resource-helpers';
import { itemListSchema } from '@/lib/structured-data';
import { getLevelClassIds } from '@/lib/level-cache';
import { getNameMapsCached } from '@/lib/name-maps-cache';
// 2026-08-07 nightly fix: import FilterShell directly instead of via
// `next/dynamic({ ssr: true })`. The dynamic wrapper placed the component
// in its own Suspense boundary, which caused the streamed HTML to contain
// both the loading.tsx fallback AND the real FilterShell content side by
// side — when the browser's React runtime replaced the fallback with the
// streamed content, the resulting DOM no longer matched the loading
// skeleton, triggering React #418/#422 hydration mismatches
// (ERR-Q82BHG 5× and ERR-XBCTZD 5× in 2026-08-07 nightly digest).
// Direct import keeps the FilterShell in the main page render so the
// SSR'd HTML is the single source of truth for hydration.
import FilterShell from '@/components/ressources/FilterShell';

import type { Facets } from '@/lib/facets';
import { getCurrentUser } from '@/lib/auth';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  const sp = await searchParams;
  const teacherNumericId = sp.teacherId ? parseInt(sp.teacherId, 10) : null;

  // Look up teacher for personalized title
  let teacherName: string | null = null;
  if (teacherNumericId && !Number.isNaN(teacherNumericId)) {
    const t = await prisma.user.findUnique({
      where: { numericId: teacherNumericId },
      select: { firstName: true, lastName: true },
    });
    if (t) teacherName = `${t.firstName || ''} ${t.lastName || ''}`.trim() || null;
  }

  const totalResources = await prisma.resource.count({ where: { status: 'PUBLISHED' } });
  const baseTitle = isAr ? 'جميع الموارد التربوية' : 'Toutes les ressources pédagogiques';
  const title = teacherName
    ? isAr
      ? `موارد ${teacherName}`
      : `Ressources de ${teacherName}`
    : baseTitle;
  const description = teacherName
    ? isAr
      ? `جميع موارد ${teacherName} على إكسامانت: دروس، فروض، تمارين، سلاسل.`
      : `Découvrez toutes les ressources partagées par ${teacherName} sur Examanet : cours, devoirs, exercices, séries et corrigés.`
    : isAr
      ? `اكتشف أكثر من ${totalResources.toLocaleString('ar-TN')} مورد: دروس، فروض، تمارين، سلاسل، ملخصات، مواضيع باك وإصلاحات.`
      : 'Explorez plus de 15 000 ressources : cours, devoirs, exercices, séries, résumés, sujets de bac et corrigés.';

  return {
    title,
    description,
    alternates: {
      canonical: teacherNumericId ? `/ressources?teacherId=${teacherNumericId}` : '/ressources',
      languages: {
        'fr-TN': teacherNumericId ? `/ressources?teacherId=${teacherNumericId}` : '/ressources',
        'ar-TN': teacherNumericId ? `/ar/ressources?teacherId=${teacherNumericId}` : '/ar/ressources',
        'x-default': teacherNumericId ? `/ressources?teacherId=${teacherNumericId}` : '/ressources',
      },
    },
    openGraph: {
      title: isAr ? 'جميع الموارد — إكسامانت' : 'Toutes les ressources — Examanet',
      description: isAr
        ? `${totalResources.toLocaleString('ar-TN')} درس, تمرين, موضوع باك وإصلاح للبرنامج التونسي.`
        : '15 000+ cours, exercices, sujets de bac et corrigés pour le programme tunisien.',
      url: '/ressources',
      type: 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
      images: [`${process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com'}/api/og/page/ressources`],
    },
    twitter: {
      card: 'summary_large_image',
      title: isAr ? 'جميع الموارد — إكسامانت' : 'Toutes les ressources — Examanet',
      description: isAr
        ? `${totalResources.toLocaleString('ar-TN')} درس, تمرين, موضوع باك وإصلاح للبرنامج التونسي.`
        : '15 000+ cours, exercices, sujets de bac et corrigés pour le programme tunisien.',
      images: [`${process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com'}/api/og/page/ressources`],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-snippet': -1 },
    },
  };
}

export const dynamic = 'force-dynamic'; // dynamic because of searchParams

interface SearchParams {
  q?: string;
  type?: string | string[];
  class?: string | string[];
  section?: string | string[];
  subject?: string | string[];
  trimestre?: string | string[];
  year?: string | string[];
  language?: string | string[];
  hasCorrection?: string;
  collegePilote?: string;
  collegeOrdinaire?: string;
  lyceePilote?: string;
  lyceeOrdinaire?: string;
  teacherId?: string;
  sort?: string;
  page?: string;
  view?: string;
}

const toArr = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

export default async function ResourcesPage(props: { searchParams: Promise<SearchParams> }) {
  // ============== MIN LOADING TIME (UX) ==============
  // Force the loading state to be visible for at least 600ms. This prevents
  // the loading skeleton from flashing so fast that users don't see it.
  // Minimal artificial delay — used so the loading.tsx skeleton is visible
  // for at least a brief moment (avoids layout flash). Reduced from 600ms →
  // 150ms in 2026-08-09 perf pass: the page now loads fast enough that 600ms
  // was just adding perceived latency.
  const MIN_LOADING_MS = 150;
  const minLoadingTimer = new Promise<void>((resolve) => setTimeout(resolve, MIN_LOADING_MS));

  const sp = await props.searchParams;

  // ============== HANDLE LEGACY URLS (migrate from CUID to numericId) ==============
  // Old shared links used ?teacher=CUID. The current code uses ?teacherId=NUMERIC.
  // If we detect the old format, look up the teacher's numericId and redirect
  // to the canonical URL to prevent hydration mismatches.
  const legacyTeacherCuid = (sp as Record<string, string | string[] | undefined>).teacher;
  if (legacyTeacherCuid && !sp.teacherId) {
    const cuid = Array.isArray(legacyTeacherCuid) ? legacyTeacherCuid[0] : legacyTeacherCuid;
    if (cuid && cuid.startsWith('cm')) {
      const t = await prisma.user.findUnique({
        where: { id: cuid },
        select: { numericId: true },
      });
      if (t?.numericId) {
        // Preserve all other params, swap teacher → teacherId
        const newSp = new URLSearchParams();
        for (const [k, v] of Object.entries(sp)) {
          if (k === 'teacher') continue;
          if (Array.isArray(v)) v.forEach((vv) => newSp.append(k, vv));
          else if (v != null) newSp.set(k, v);
        }
        newSp.set('teacherId', String(t.numericId));
        redirect(`/ressources?${newSp.toString()}`);
      }
    }
  }

  // ============== Parse URL state ==============
  const q = sp.q || '';
  const type = toArr(sp.type);
  const classSlug = toArr(sp.class);
  const section = toArr(sp.section);
  const subject = toArr(sp.subject);
  const trimestre = toArr(sp.trimestre);
  const year = toArr(sp.year);
  const language = toArr(sp.language);
  const hasCorrection = sp.hasCorrection === '1';
  const collegePilote = sp.collegePilote === '1';
  const collegeOrdinaire = sp.collegeOrdinaire === '1';
  const lyceePilote = sp.lyceePilote === '1';
  const lyceeOrdinaire = sp.lyceeOrdinaire === '1';
  const teacherNumericId = sp.teacherId ? parseInt(sp.teacherId, 10) : null;
  const sort = sp.sort || 'recent';
  const page = Math.max(1, parseInt(sp.page || '1'));

  // ============== OPTIMIZED DATA FETCH (CF Workers + D1) ==============
  // Single endpoint returns everything: resources + total + facets + nameMaps
  // Replaces 22+ prisma-compat queries with 1 HTTP call (which internally does 4-5 SQL)
  // The endpoint also handles all the JOINs, groupBy, and aggregation
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  const requestUrl = new URL('/api/ressources-data', request.url);
  // Pass all search params
  for (const [key, value] of searchParams.entries()) {
    requestUrl.searchParams.set(key, String(value));
  }
  requestUrl.searchParams.set('page', String(page));
  
  const dataResponse = await fetch(requestUrl.toString(), {
    headers: {
      'cookie': request.headers.get('cookie') || '',
    },
  });
  
  if (!dataResponse.ok) {
    throw new Error(`Data fetch failed: ${dataResponse.status}`);
  }
  
  const data = await dataResponse.json();
  const resources = data.resources;
  const total = data.total;
  const facets = data.facets;
  const { allClasses, allSections, allSubjects } = {
    allClasses: Object.entries(data.nameMaps.class).map(([slug, nameFr]) => ({ slug, nameFr })),
    allSections: Object.entries(data.nameMaps.section).map(([slug, nameFr]) => ({ slug, nameFr })),
    allSubjects: Object.entries(data.nameMaps.subject).map(([slug, nameFr]) => ({ slug, nameFr })),
  };
  
  // Constants for compatibility with the rest of the page
  const PAGE_SIZE = 24;
  
  // ============== Favorites (if logged) + min loading time ==============
  // Convert the favorites Set to a plain string[] before passing across the
  // RSC boundary to <FilterShell> (a client component). Sets serialize
  // unreliably across RSC and can deserialise as `{}` on the client, which
  // breaks `favorites.has(r.id)` and triggers React #418 / #422 hydration
  // errors. Arrays are safe to serialize.
  const [favoriteIds] = await Promise.all([
    currentUser
      ? getUserFavorites(resources.map((r) => r.id))
      : Promise.resolve(new Set<string>()),
    minLoadingTimer,  // ensure loading state visible for at least 600ms
  ]);
  const favoriteIdsArray = Array.from(favoriteIds);

  // ============== JSON-LD ==============
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const jsonLd =
    resources.length > 0
      ? itemListSchema({
          name: 'Toutes les ressources pédagogiques — Examanet',
          description: `Catalogue de ${total.toLocaleString('fr-FR')} ressources pédagogiques gratuites du système éducatif tunisien.`,
          url: `${baseUrl}/ressources`,
          items: resources.slice(0, 50).map((r) => ({
            name: r.title,
            url: `${baseUrl}/ressources/${r.numericId}/${r.slug}`,
            description:
              r.description
                ?.replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 200) || undefined,
          })),
        })
      : null;

  // ============== Page header text ==============
  let pageTitle = 'Toutes les ressources';
  let pageSubtitle = `${total.toLocaleString('fr-FR')} ressources gratuites pour le système éducatif tunisien.`;
  if (q) {
    pageTitle = `Résultats pour « ${q} »`;
    pageSubtitle = `${total.toLocaleString('fr-FR')} résultats correspondants.`;
  } else if (teacherInfo) {
    const teacherName =
      `${teacherInfo.firstName || ''} ${teacherInfo.lastName || ''}`.trim() || 'cet enseignant';
    pageTitle = `Ressources de ${teacherName}`;
    pageSubtitle = `${total.toLocaleString('fr-FR')} ressources partagées par ${teacherName} sur Examanet.`;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Always render the JSON-LD script (matching loading.tsx placeholder)
          to keep the wrapper child count consistent. React's hydration
          check compares element counts — if jsonLd is null we render an
          empty {} placeholder so the structure is identical to loading. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd ? JSON.stringify(jsonLd) : '{}' }}
      />
      <main className="flex-1 pt-24 lg:pt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page header — element type + child count MUST match loading.tsx
              (h1 + p + progress-bar placeholder) to avoid React #418/#422
              hydration mismatches when the page render fails and the
              loading skeleton remains in the DOM. The placeholder div takes
              the same height as the loading's progress bar so the layout
              doesn't shift when the streaming content replaces the loading. */}
          <div className="mb-8">
            <h1 className="text-3xl lg:text-4xl font-extrabold mb-3 leading-tight text-slate-900 flex items-center gap-5">
              <span>{pageTitle}</span>
            </h1>
            <p className="text-slate-600 text-sm lg:text-base">{pageSubtitle}</p>
            {/* Placeholder matching the loading.tsx progress bar — same
                height, same vertical margin, no visual impact (transparent
                + no children). Keeps the wrapper's child count at 3
                (h1 + p + progress-bar) so the React tree matches loading. */}
            <div
              className="mt-4 w-72 h-1.5 rounded-full overflow-hidden"
              aria-hidden="true"
            />
          </div>

          {/* FilterShell (client) */}
          <FilterShell
            initialData={{
              resources,
              total,
              totalPages: Math.ceil(total / PAGE_SIZE),
              currentPage: page,
              facets,
              nameMaps: {
                class: Object.fromEntries(allClasses.map((c) => [c.slug, c.nameFr])),
                section: Object.fromEntries(allSections.map((s) => [s.slug, s.nameFr])),
                subject: Object.fromEntries(allSubjects.map((s) => [s.slug, s.nameFr])),
              },
            }}
            userId={currentUser?.id ?? null}
            initialFavorites={favoriteIdsArray}
          />
        </div>
      </main>

      </div>
  );
}

function FilterShellSkeleton() {
  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-6">
      <div className="bg-white rounded-2xl border border-slate-200 h-[600px] animate-pulse" />
      <div className="space-y-3">
        <div className="h-14 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="grid grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-72 bg-white rounded-2xl border border-slate-200 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

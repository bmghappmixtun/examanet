// @ts-nocheck
import type { Metadata } from 'next';
import { unstable_cache as nextCache } from 'next/cache';

import { prisma } from '@/lib/prisma';
import HomeClient from '@/components/home/HomeClient';

// PERF 2026-08-16: Home page is the most-hit page on the site (~620K function
// invocations over 22 days contributed $7.42 to the Aug-2026 Vercel bill).
// Each render fired 8 Prisma queries (resource.findMany x2, count x4,
// subject.findMany, user.favorites) which (a) blew through the Prisma pool
// (connection_limit=2 per Lambda) and (b) generated one observability event
// per query.
//
// We now:
// 1. Cache the static data (popular, recent, stats, subjects) for 5 min
//    via unstable_cache with explicit tags for surgical invalidation.
// 2. Move favorites to a client-side fetch (personalized, must be per-user).
// 3. Drop the `getUserFavorites` server call from getHomeData().
//
// Result: home page is now 1 Prisma call (subjects, cached) instead of 8,
// and never times out due to pool exhaustion.
const REVALIDATE_S = 300;
const getCachedHomeData = nextCache(
  async () => {
    const [popular, recent, statsArr, subjects] = await Promise.all([
      prisma.resource.findMany({
        where: { status: 'PUBLISHED' },
        take: 8,
        orderBy: [{ viewsCount: 'desc' }, { publishedAt: 'desc' }],
        include: {
          subject: true,
          class: true,
          teacher: {
            select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
          },
        },
      }),
      prisma.resource.findMany({
        where: { status: 'PUBLISHED' },
        take: 8,
        orderBy: { publishedAt: 'desc' },
        include: {
          subject: true,
          class: true,
          teacher: {
            select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
          },
        },
      }),
      Promise.all([
        prisma.resource.count({ where: { status: 'PUBLISHED' } }),
        prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
        prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
        prisma.resource.aggregate({ _sum: { downloadsCount: true } }),
      ]),
      prisma.subject.findMany({ orderBy: { order: 'asc' } }),
    ]);
    return { popular, recent, statsArr, subjects };
  },
  ['home-data-v1'],
  { revalidate: REVALIDATE_S, tags: ['home', 'resources', 'subjects'] },
);


// PERF 2026-08-16: Static metadata. The previous version called `headers()`
// to detect the AR locale, which forced the page into dynamic mode and
// bypassed the ISR cache. The [locale] layout (parent) already handles
// per-locale metadata (og:locale, hreflang, etc.), so this page only needs
// to set the title/description which is the same for both locales.
export const metadata: Metadata = {
  // SEO 2026-08-22: trimmed from 71 to 50 chars (Google displays ~60 chars
  // before truncating). Removed "gratuits" (already in description) and
  // "en Tunisie" (the brand + description already imply Tunisia).
  // Using `absolute: true` to opt out of the parent layout's title template
  // (otherwise the rendered title would be "... | Examanet" — the brand
  // appears twice on the homepage).
  // Title is inherited from [locale] layout (per-locale, no template applied via absolute)
  description:
    'Plateforme pédagogique #1 pour les élèves tunisiens : cours, devoirs, exercices, sujets de bac et corrigés pour le Primaire, Collège et Lycée. Gratuit.',
  // SEO 2026-08-22: don't override canonical here — the [locale] layout's
  // generateMetadata sets the locale-prefixed canonical (and hreflang
  // alternates) for both /fr and /ar.
};


export const revalidate = 300; // 5 min cache

async function getHomeData() {
  // PERF 2026-08-16: Use the cached fetcher (5 min TTL + tags). The favorites
  // are now applied client-side via /api/favorites so they stay per-user and
  // the server-rendered HTML can be cached safely.
  const { popular, recent, statsArr, subjects } = await getCachedHomeData();
  const [resourceCount, teacherCount, studentCount, downloads] = statsArr;
  return {
    popular: JSON.parse(JSON.stringify(popular)),
    recent: JSON.parse(JSON.stringify(recent)),
    subjects: JSON.parse(JSON.stringify(subjects)),
    stats: {
      resources: resourceCount,
      teachers: teacherCount,
      students: studentCount,
      downloads: downloads._sum.downloadsCount || 0,
    },
  };
}

// 2026-08-19 nightly fix (ERR-LKRCDG 3× + ERR-FGCMHE 1× React #419 on /fr):
//
// PREVIOUSLY this page wrapped HomeClient in `next/dynamic(..., { ssr: true })`
// inside a redundant <div className="min-h-screen flex flex-col"> wrapper.
// The dynamic() import created an extra React Suspense boundary (visible in
// the SSR HTML as `<!--$-->...<!--/$-->` markers around the HomeClient
// output), and the layout already provides a <main className="min-h-screen">
// so the inner <main> from HomeClient (now fixed to <div>) plus the
// outer layout <main> created a real HTML5 accessibility violation. The
// dynamic() boundary also briefly showed its `loading` fallback
// (<div className="min-h-screen bg-gradient-to-br from-primary-50...">)
// during client-side navigations from the not-found boundary, which is
// a different DOM tree than HomeClient's output — that swap (loading div
// → real HomeClient div) is what triggered React #419 ("recovered from
// hydration mismatch") on the navigation sequence:
//   not-found.tsx Link "/" → middleware → /fr → hydrate
//
// FIX: import HomeClient directly (no dynamic()) and keep the page-level
// flex wrapper so HomeClient's `flex-1` class still has a flex parent.
// The layout's <main> + page wrapper <div> + HomeClient's <div> (no longer
// <main>) is a single, consistent tree with no nested <main> and no
// Suspense boundary swap. HomeClient already has 'use client' so it
// hydrates naturally without needing a dynamic() boundary.
export default async function HomePage() {
  const data = await getHomeData();

  return (
    <div className="flex flex-col">
      <HomeClient {...data} />
    </div>
  );
}
// 1784381489

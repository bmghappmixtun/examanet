// @ts-nocheck
import { Link } from '@/i18n/navigation';
// 2026-08-28: switched to D1 shim to avoid prisma-compat race condition on CF Workers
import { prisma } from '@/lib/d1-prisma-shim';
import { itemListSchema, breadcrumbSchema, SITE_URL } from '@/lib/structured-data';
import { getTranslations, getLocale } from 'next-intl/server';
import {
  GraduationCap,
  MapPin,
  Star,
  Search,
  ChevronLeft,
  ChevronRight,
  Award,
  Sparkles,
  Users,
  CheckCircle2,
  X,
  BookOpen,
} from 'lucide-react';
import type { Prisma } from '@prisma/client';
import TeachersSearchBar from './TeachersSearchBar';
import TeachersFilters from './TeachersFilters';
import TeachersSort from './TeachersSort';

export const revalidate = 300; // 5 min cache

const PAGE_SIZE = 24;

type SearchParams = {
  q?: string;
  subject?: string; // subject slug (comma-separated for multi-select)
  class?: string; // class slug (comma-separated for multi-select)
  verified?: string; // '1' to require verified only
  sort?: 'popular' | 'rating' | 'followers' | 'recent' | 'name';
  page?: string;
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const total = await prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } });
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr ? `المعلمون — ${total} معلم معتمد` : `Professeurs — ${total} enseignants certifiés`,
    description: isAr
      ? `اكتشف ${total} معلماً معتمداً ومواردهم التعليمية المجانية: دروس، فروض، تمارين لجميع المستويات في تونس.`
      : `Découvrez ${total} professeurs certifiés et leurs ressources gratuites en Tunisie : cours, devoirs, exercices.`,
    alternates: { canonical: 'https://examanet.com/professeurs' },
    openGraph: {
      title: isAr ? 'المعلمون التونسيون على إكسامانت' : 'Professeurs tunisiens sur Examanet',
      description: isAr
        ? 'اكتشف معلمينا المعتمدين ومواردهم المجانية.'
        : 'Découvrez nos enseignants certifiés et leurs ressources gratuites.',
      url: '/professeurs',
      type: 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
      images: [
        {
          url: `/api/og/page/professeurs`,
          width: 1200,
          height: 630,
          alt: isAr ? 'Examanet — المعلمون التونسيون' : 'Examanet — Professeurs tunisiens',
        },
      ],
    },
  };
}

const breadcrumbJsonLd = breadcrumbSchema([
  { name: 'Accueil', url: SITE_URL },
  { name: 'Professeurs', url: `${SITE_URL}/professeurs` },
]);

export default async function TeachersPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  try {
  const tt = await getTranslations();
  const sp = await props.searchParams;
  const q = (sp.q || '').trim();
  const subjectSlugs = (sp.subject || '').split(',').filter(Boolean);
  const classSlugs = (sp.class || '').split(',').filter(Boolean);
  const verifiedOnly = sp.verified === '1';
  const sort = sp.sort || 'popular';
  const page = Math.max(1, parseInt(sp.page || '1'));

  // -------- 1. Build teacher WHERE filter --------
  // Note: subject/class filters are applied later via resource JOIN (subjects/classes taught).
  // Search: token-based name + school + email + bio + numericId.
  // Each whitespace-separated token must match at least one searchable field (AND between tokens, OR between fields).
  // This handles "Houcine Labiadh" (full name), "Labiadh Houcine" (reversed), "Ali naf" (partial), etc.
  const teacherWhere: Prisma.UserWhereInput = {
    role: 'TEACHER',
    status: 'ACTIVE',
    ...(verifiedOnly ? { isVerifiedTeacher: true } : {}),
    ...(q
      ? (() => {
          const tokens = q
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
          if (tokens.length === 0) return {};
          return {
            AND: tokens.map((token) => ({
              OR: [
                { firstName: { contains: token, mode: 'insensitive' } },
                { lastName: { contains: token, mode: 'insensitive' } },
                { firstNameAr: { contains: token, mode: 'insensitive' } },
                { lastNameAr: { contains: token, mode: 'insensitive' } },
                { schoolName: { contains: token, mode: 'insensitive' } },
                { schoolNameAr: { contains: token, mode: 'insensitive' } },
                { email: { contains: token, mode: 'insensitive' } },
                { bio: { contains: token, mode: 'insensitive' } },
                // numericId exact match (if user types a number)
                ...(/^\d+$/.test(token)
                  ? [{ numericId: parseInt(token, 10) }]
                  : []),
                // slug match (URL-friendly name)
                { slug: { contains: token, mode: 'insensitive' } },
              ],
            })),
          };
        })()
      : {}),
  };

  // -------- 2. Get distinct subjects & classes that real teachers actually teach --------
  // This gives us accurate filter options (not arbitrary ones from User.teachingSubjects JSON).
  const [subjectsTaught, classesTaught, globalStats, teacherCountFiltered] = await Promise.all([
    prisma.subject.findMany({
      where: {
        resources: {
          some: {
            status: 'PUBLISHED',
            teacherId: { not: null },
            ...(classSlugs.length ? { class: { slug: { in: classSlugs } } } : {}),
          },
        },
      },
      select: { slug: true, nameFr: true, nameAr: true, color: true },
      orderBy: { nameFr: 'asc' },
    }),
    prisma.class.findMany({
      where: {
        resources: {
          some: {
            status: 'PUBLISHED',
            teacherId: { not: null },
            ...(subjectSlugs.length ? { subject: { slug: { in: subjectSlugs } } } : {}),
          },
        },
      },
      select: { slug: true, nameFr: true, nameAr: true },
      orderBy: { nameFr: 'asc' },
    }),
    // Global stats (independent of filters) for sidebar
    prisma.$transaction([
      prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE', isVerifiedTeacher: true } }),
      prisma.resource.count({ where: { status: 'PUBLISHED', teacherId: { not: null } } }),
    ]),
    // Teachers matching basic filters (for count display)
    prisma.user.count({ where: teacherWhere }),
  ]);

  const [totalActive, totalVerified, totalResources] = globalStats;

  // -------- 3. Filter teachers by subject/class via resource existence --------
  // Approach: find IDs of teachers who have at least 1 published resource matching the subject/class filter.
  let allowedTeacherIds: string[] | undefined;
  if (subjectSlugs.length || classSlugs.length) {
    const resourceGroups = await prisma.resource.groupBy({
      by: ['teacherId'],
      where: {
        status: 'PUBLISHED',
        teacherId: { not: null },
        ...(subjectSlugs.length ? { subject: { slug: { in: subjectSlugs } } } : {}),
        ...(classSlugs.length ? { class: { slug: { in: classSlugs } } } : {}),
      },
      _count: { _all: true },
    });
    allowedTeacherIds = resourceGroups
      .map((r) => r.teacherId)
      .filter((id): id is string => id !== null);
    if (allowedTeacherIds.length === 0) {
      // No teacher matches this combination → empty result.
      return renderEmpty({
        sp,
        q,
        subjectSlugs,
        classSlugs,
        verifiedOnly,
        sort,
        page,
        subjectsTaught,
        classesTaught,
        totalActive,
        totalVerified,
        totalResources,
        teacherCountFiltered: 0,
      });
    }
    teacherWhere.id = { in: allowedTeacherIds };
  }

  // -------- 4. Determine sort --------
  // We compute the teachers page via raw prisma query with custom aggregation.
  // To keep this simple and fast at 1000+ rows, we sort by aggregated fields using resource groupBy.
  // Strategy: get resource aggregates per teacher first, then sort+paginate teacher IDs.

  let teacherIdOrder: string[] | undefined;
  const useManualSort = sort !== 'recent';

  if (useManualSort) {
    const groups = await prisma.resource.groupBy({
      by: ['teacherId'],
      where: {
        status: 'PUBLISHED',
        teacherId: { not: null },
        ...(subjectSlugs.length ? { subject: { slug: { in: subjectSlugs } } } : {}),
        ...(classSlugs.length ? { class: { slug: { in: classSlugs } } } : {}),
      },
      _avg: { avgRating: true },
      _count: { _all: true },
    });

    // Build map teacherId -> { count, avgRating, downloads (need separate query) }
    const ids = groups.map((g) => g.teacherId).filter((id): id is string => id !== null);

    // Get followers + downloads aggregates via separate queries.
    const [downloadAgg, followAgg] = await Promise.all([
      ids.length
        ? prisma.download.groupBy({
            by: ['userId'],
            where: { resource: { teacherId: { in: ids }, status: 'PUBLISHED' } },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ userId: string; _count: { _all: number } }>),
      ids.length
        ? prisma.follow.groupBy({
            by: ['followingId'],
            where: { followingId: { in: ids } },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ followingId: string; _count: { _all: number } }>),
    ]);

    // Per-teacher downloads
    const teacherDownloads = new Map<string, number>();
    for (const d of downloadAgg) {
      // We need downloads grouped by teacher, not by user — re-query simpler:
    }
    // Simpler: directly query downloads grouped by resource.teacherId via raw or by joining.
    // Pragmatic alternative: just compute resource-based downloads from resources themselves.
    const downloadByTeacher = await prisma.resource.findMany({
      where: { status: 'PUBLISHED', teacherId: { in: ids } },
      select: { teacherId: true, downloadsCount: true },
    });
    const dlMap = new Map<string, number>();
    for (const r of downloadByTeacher) {
      if (!r.teacherId) continue;
      dlMap.set(r.teacherId, (dlMap.get(r.teacherId) || 0) + r.downloadsCount);
    }

    const fMap = new Map<string, number>();
    for (const f of followAgg) {
      fMap.set(f.followingId, f._count._all);
    }

    const meta = groups.map((g) => ({
      id: g.teacherId!,
      count: g._count._all,
      rating: g._avg.avgRating || 0,
      downloads: dlMap.get(g.teacherId!) || 0,
      followers: fMap.get(g.teacherId!) || 0,
    }));

    // Filter to allowedTeacherIds if set (else use all meta)
    const filtered = allowedTeacherIds
      ? meta.filter((m) => allowedTeacherIds!.includes(m.id))
      : meta;

    let sorted: typeof filtered;
    if (sort === 'popular')
      sorted = filtered.sort((a, b) => b.count - a.count || b.downloads - a.downloads);
    else if (sort === 'rating')
      sorted = filtered.sort((a, b) => b.rating - a.rating || b.count - a.count);
    else if (sort === 'followers')
      sorted = filtered.sort((a, b) => b.followers - a.followers || b.count - a.count);
    else if (sort === 'name')
      sorted = filtered.sort((a, b) => 0); // placeholder, will use name on DB
    else sorted = filtered;

    teacherIdOrder = sorted.map((m) => m.id);
  }

  // -------- 5. Fetch teacher rows --------
  // For "recent" we sort by createdAt desc, for "name" by lastName/firstName asc.
  let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
  if (sort === 'name') orderBy = { lastName: 'asc' };

  // Build teacher where including id filter if we have an order list.
  if (teacherIdOrder && teacherIdOrder.length > 0) {
    teacherWhere.id = { in: teacherIdOrder };
  }

  const [teachersRaw, totalMatching] = await Promise.all([
    prisma.user.findMany({
      where: teacherWhere,
      select: {
        id: true,
        numericId: true,
        slug: true,
        firstName: true,
        lastName: true,
        firstNameAr: true,
        lastNameAr: true,
        avatarUrl: true,
        bio: true,
        schoolName: true,
        governorate: true,
        isVerifiedTeacher: true,
        createdAt: true,
      },
      orderBy,
      // When using custom sort (popular/rating/followers), fetch ALL matching teachers
      // so we can reorder them in JS before paginating. Otherwise use DB pagination.
      ...(teacherIdOrder && teacherIdOrder.length > 0
        ? {}
        : { take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    }),
    teacherCountFiltered,
  ]);

  // If we have a custom order, reorder rows accordingly (then paginate manually).
  let teachers = teachersRaw;
  let totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  if (teacherIdOrder && teacherIdOrder.length > 0) {
    const byId = new Map(teachersRaw.map((t) => [t.id, t]));
    const ordered = teacherIdOrder
      .map((id) => byId.get(id))
      .filter((t): t is (typeof teachersRaw)[number] => Boolean(t));
    // Manual pagination on ordered list.
    const start = (page - 1) * PAGE_SIZE;
    teachers = ordered.slice(start, start + PAGE_SIZE);
    totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  }

  // -------- 6. Fetch per-teacher stats in one batch (resource counts/downloads/views/rating) + followers --------
  const teacherIds = teachers.map((t) => t.id);
  const [resourceAgg, followCounts] = await Promise.all([
    teacherIds.length
      ? prisma.resource.groupBy({
          by: ['teacherId'],
          where: { status: 'PUBLISHED', teacherId: { in: teacherIds } },
          _sum: { viewsCount: true, downloadsCount: true },
          _avg: { avgRating: true },
          _count: { _all: true },
        })
      : Promise.resolve(
          [] as Array<{
            teacherId: string | null;
            _sum: { viewsCount: number | null; downloadsCount: number | null };
            _avg: { avgRating: number | null };
            _count: { _all: number };
          }>,
        ),
    teacherIds.length
      ? prisma.follow.groupBy({
          by: ['followingId'],
          where: { followingId: { in: teacherIds } },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ followingId: string; _count: { _all: number } }>),
  ]);

  const statsMap = new Map<
    string,
    { files: number; downloads: number; views: number; rating: number; followers: number }
  >();
  for (const r of resourceAgg) {
    if (!r.teacherId) continue;
    statsMap.set(r.teacherId, {
      files: r._count._all,
      downloads: r._sum.downloadsCount || 0,
      views: r._sum.viewsCount || 0,
      rating: r._avg.avgRating || 0,
      followers: 0,
    });
  }
  for (const f of followCounts) {
    const ex = statsMap.get(f.followingId) || {
      files: 0,
      downloads: 0,
      views: 0,
      rating: 0,
      followers: 0,
    };
    ex.followers = f._count._all;
    statsMap.set(f.followingId, ex);
  }

  // -------- 7. Render --------
  const hasFilters = q || subjectSlugs.length > 0 || classSlugs.length > 0 || verifiedOnly;

  // JSON-LD: ItemList of teachers for rich SERP results
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://examanet.com';
  const teacherListJsonLd =
    teachers.length > 0
      ? itemListSchema({
          name: hasFilters ? tt('teacher.filteredResults') : tt('teacher.allResults'),
          description: tt('teacher.richSnippet').replace('{count}', String(totalMatching)),
          url: `${baseUrl}/professeurs`,
          items: teachers.slice(0, 50).map((t) => ({
            name: `${t.firstName || ''} ${t.lastName || ''}`.replace(/\s+/g, ' ').trim(),
            url: `${baseUrl}/professeurs/${t.numericId}/${t.slug}`,
            description:
              t.bio ||
              (t.schoolName
                ? tt('teacher.atSchool').replace('{school}', t.schoolName)
                : tt('teacher.onExamanet')),
          })),
        })
      : null;

  return (
    <div className="min-h-screen flex flex-col">
      {teacherListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(teacherListJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="flex-1 pt-20">
        {/* HERO */}
        <section className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 py-12 lg:py-16 border-b border-amber-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-amber-700 text-sm font-bold mb-3">
              <GraduationCap className="w-4 h-4" />
              <span>Enseignants certifiés</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold mb-3 tracking-tight">
              {tt('teacher.hero.h1A')}{' '}
              <span className="gradient-text">{tt('teacher.hero.h1B')}</span>
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mb-6">
              {tt('teacher.hero.subtitle').replace('{count}', String(totalActive))}
            </p>

            {/* Mini stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
              <Stat icon={Users} value={totalActive} label="Professeurs" />
              <Stat icon={CheckCircle2} value={totalVerified} label="Vérifiés" />
              <Stat icon={BookOpen} value={totalResources} label="Ressources" />
              <Stat icon={Award} value={subjectsTaught.length} label="Matières" />
            </div>
          </div>
        </section>

        {/* SEARCH + SORT BAR */}
        <section className="bg-white border-b border-slate-200 sticky top-16 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <TeachersSearchBar initialQ={q} />
            <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
              <p className="text-sm text-slate-600">
                <span className="font-bold text-slate-900">{totalMatching}</span> professeur
                {totalMatching > 1 ? 's' : ''}
                {hasFilters ? <span className="text-slate-500"> · filtré</span> : null}
              </p>
              <TeachersSort current={sort} />
            </div>
          </div>
        </section>

        {/* MAIN GRID: SIDEBAR + RESULTS */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid lg:grid-cols-[280px_1fr] gap-8">
            <aside className="lg:sticky lg:top-32 lg:self-start">
              <TeachersFilters
                subjects={subjectsTaught}
                classes={classesTaught}
                selectedSubjects={subjectSlugs}
                selectedClasses={classSlugs}
                verifiedOnly={verifiedOnly}
              />
            </aside>

            <div>
              {teachers.length === 0 ? (
                <EmptyState q={q} />
              ) : (
                <>
                  {/* Featured (top 3 by current sort on first page only) */}
                  {page === 1 && !hasFilters && sort === 'popular' && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 text-amber-700 text-sm font-bold mb-3">
                        <Sparkles className="w-4 h-4" />
                        <span>Top contributeurs</span>
                      </div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {teachers.slice(0, 3).map((t) => (
                          <TeacherCard key={t.id} t={t} stats={statsMap.get(t.id)} featured />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Active filter chips */}
                  {hasFilters && (
                    <ActiveChips
                      sp={sp}
                      subjectSlugs={subjectSlugs}
                      classSlugs={classSlugs}
                      subjects={subjectsTaught}
                      classes={classesTaught}
                    />
                  )}

                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {teachers.map((t) => (
                      <TeacherCard key={t.id} t={t} stats={statsMap.get(t.id)} />
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <Pagination
                      current={page}
                      total={totalPages}
                      buildHref={(p) => buildHref({ ...sp, page: String(p) })}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </main>
      </div>
  );
  } catch (e: any) {
    console.error("[profs page] error:", e?.message);
    return renderEmptyPage();
  }

}

// =====================================================================
// Sub-components
// =====================================================================

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number | string;
  label: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-amber-200 p-3 shadow-sm">
      <Icon className="w-4 h-4 text-amber-600 mb-1" />
      <div className="text-2xl font-extrabold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
    </div>
  );
}

function TeacherCard({
  t,
  stats,
  featured,
}: {
  t: {
    id: string;
    numericId: number | null;
    slug: string;
    firstName: string | null;
    lastName: string | null;
    firstNameAr: string | null;
    lastNameAr: string | null;
    avatarUrl: string | null;
    bio: string | null;
    schoolName: string | null;
    governorate: string | null;
    isVerifiedTeacher: boolean;
  };
  stats?: { files: number; downloads: number; views: number; rating: number; followers: number };
  featured?: boolean;
}) {
  const hasFr = !!(t.firstName || t.lastName);
  const hasAr = !!(t.firstNameAr || t.lastNameAr);
  const initials = (() => {
    if (hasFr) {
      return (
        `${(t.firstName?.[0] || '').toUpperCase()}${(t.lastName?.[0] || '').toUpperCase()}` || '؟'
      );
    }
    if (hasAr) {
      const ar = `${t.firstNameAr || ''} ${t.lastNameAr || ''}`.trim();
      const m = ar.match(/[\p{L}]/u);
      const m2 = ar.match(/[\p{L}][\s\S]*?[\p{L}]/u);
      return (m ? m[0] : '') + (m2 && m2[0] !== m2[1] ? m2[0].slice(-1) : '');
    }
    return '؟';
  })();
  const fullName =
    `${t.firstName || ''} ${t.lastName || ''}`.trim() ||
    `${t.firstNameAr || ''} ${t.lastNameAr || ''}`.trim() ||
    'Enseignant';

  return (
    <Link
      href={`/professeurs/${t.numericId}/${t.slug}`}
      className={`card card-hover p-6 group relative ${featured ? 'ring-2 ring-amber-300 hover:ring-amber-400' : ''}`}
    >
      {featured && (
        <div className="absolute -top-2 -right-2 bg-gradient-to-br from-amber-400 to-amber-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shadow-md flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Top
        </div>
      )}

      <div className="flex items-start gap-4">
        {t.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.avatarUrl}
            alt={fullName}
            className="w-14 h-14 rounded-2xl object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white font-extrabold text-xl flex items-center justify-center flex-shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {hasFr ? (
              <h3 className="font-bold text-lg group-hover:text-primary-600 transition truncate">
                {fullName}
              </h3>
            ) : hasAr ? (
              <h3
                className="font-bold text-2xl group-hover:text-primary-600 transition truncate"
                dir="rtl"
                lang="ar"
              >
                {(t.firstNameAr || '') + ' ' + (t.lastNameAr || '')}
              </h3>
            ) : (
              <h3 className="font-bold text-lg group-hover:text-primary-600 transition truncate">
                {fullName}
              </h3>
            )}
            {t.isVerifiedTeacher && (
              <CheckCircle2
                className="w-4 h-4 text-emerald-500 flex-shrink-0"
                aria-label="Enseignant vérifié"
              />
            )}
          </div>
          {hasFr && hasAr && (
            <p className="text-sm text-slate-500 truncate" dir="rtl" lang="ar">
              {(t.firstNameAr || '') + ' ' + (t.lastNameAr || '')}
            </p>
          )}
          {t.schoolName && <p className="text-sm text-slate-500 truncate">{t.schoolName}</p>}
          {t.governorate && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {t.governorate}
            </p>
          )}
        </div>
      </div>

      {t.bio && <p className="text-sm text-slate-600 mt-3 line-clamp-2">{t.bio}</p>}

      <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-slate-100">
        <div className="text-center">
          <div className="text-lg font-extrabold">{stats?.files ?? 0}</div>
          <div className="text-xs text-slate-500">Fichiers</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-extrabold">{formatCount(stats?.downloads ?? 0)}</div>
          <div className="text-xs text-slate-500">Téléch.</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-extrabold flex items-center justify-center gap-0.5">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            {(stats?.rating ?? 0).toFixed(1)}
          </div>
          <div className="text-xs text-slate-500">Note</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-extrabold">{formatCount(stats?.followers ?? 0)}</div>
          <div className="text-xs text-slate-500">Abonnés</div>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="text-center py-16">
      <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <h3 className="text-xl font-bold text-slate-700 mb-2">Aucun professeur trouvé</h3>
      <p className="text-slate-500 max-w-md mx-auto">
        {q
          ? `Aucun résultat pour "${q}". Essayez d'élargir vos critères.`
          : "Aucun résultat pour ces filtres. Essayez d'enlever certains filtres."}
      </p>
      <Link
        href="/professeurs"
        className="inline-block mt-6 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:shadow-lg transition"
      >
        Réinitialiser les filtres
      </Link>
    </div>
  );
}

function Pagination({
  current,
  total,
  buildHref,
}: {
  current: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  // Smart windowing: always show first, last, current ±2.
  // Pattern: 1 … 4 5 6 … 40 (when current=5)
  //          1 2 3 4 5 6 7 … 40 (when current ≤ 4)
  //          1 … 34 35 36 37 38 39 40 (when current ≥ total-3)
  // If total is small (≤ 7), show all.
  const siblings = 2;
  const showAll = total <= 7;
  const windowStart = Math.max(2, current - siblings);
  const windowEnd = Math.min(total - 1, current + siblings);

  type Item = { type: 'page'; n: number } | { type: 'ellipsis'; key: string };
  const items: Item[] = [];

  if (showAll) {
    for (let n = 1; n <= total; n++) items.push({ type: 'page', n });
  } else {
    items.push({ type: 'page', n: 1 });
    if (windowStart > 2) items.push({ type: 'ellipsis', key: 'left' });
    for (let n = windowStart; n <= windowEnd; n++) items.push({ type: 'page', n });
    if (windowEnd < total - 1) items.push({ type: 'ellipsis', key: 'right' });
    items.push({ type: 'page', n: total });
  }

  return (
    <nav className="mt-10 flex items-center justify-center gap-1 flex-wrap" aria-label="Pagination">
      <Link
        href={current > 1 ? buildHref(current - 1) : '#'}
        className={`p-2 border border-slate-200 rounded-lg ${current <= 1 ? 'opacity-30 pointer-events-none' : 'hover:bg-slate-50'}`}
        aria-label="Page précédente"
      >
        <ChevronLeft className="w-4 h-4" />
      </Link>

      <div className="flex items-center gap-1 flex-wrap justify-center">
        {items.map((item) => {
          if (item.type === 'ellipsis') {
            return (
              <span key={item.key} className="px-1.5 text-slate-400 select-none" aria-hidden="true">
                …
              </span>
            );
          }
          const p = item.n;
          const active = p === current;
          return (
            <Link
              key={p}
              href={buildHref(p)}
              aria-current={active ? 'page' : undefined}
              className={`min-w-[2.25rem] h-9 px-2 flex items-center justify-center rounded-lg text-sm font-semibold transition ${
                active
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow'
                  : 'text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {p}
            </Link>
          );
        })}
      </div>

      <Link
        href={current < total ? buildHref(current + 1) : '#'}
        className={`p-2 border border-slate-200 rounded-lg ${current >= total ? 'opacity-30 pointer-events-none' : 'hover:bg-slate-50'}`}
        aria-label="Page suivante"
      >
        <ChevronRight className="w-4 h-4" />
      </Link>
    </nav>
  );
}

function ActiveChips({
  sp,
  subjectSlugs,
  classSlugs,
  subjects,
  classes,
}: {
  sp: SearchParams;
  subjectSlugs: string[];
  classSlugs: string[];
  subjects: Array<{ slug: string; nameFr: string; color?: string | null }>;
  classes: Array<{ slug: string; nameFr: string }>;
}) {
  const subjectMap = new Map(subjects.map((s) => [s.slug, s.nameFr]));
  const classMap = new Map(classes.map((c) => [c.slug, c.nameFr]));

  const chips: { label: string; removeHref: string }[] = [];
  if (sp.q) chips.push({ label: `« ${sp.q} »`, removeHref: buildHref({ ...sp, q: '' }) });
  for (const s of subjectSlugs) {
    const newSubs = subjectSlugs.filter((x) => x !== s).join(',');
    chips.push({
      label: subjectMap.get(s) || s,
      removeHref: buildHref({ ...sp, subject: newSubs, page: '1' }),
    });
  }
  for (const c of classSlugs) {
    const newClasses = classSlugs.filter((x) => x !== c).join(',');
    chips.push({
      label: classMap.get(c) || c,
      removeHref: buildHref({ ...sp, class: newClasses, page: '1' }),
    });
  }
  if (sp.verified === '1') {
    chips.push({ label: '✓ Vérifiés', removeHref: buildHref({ ...sp, verified: '', page: '1' }) });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((chip, i) => (
        <Link
          key={i}
          href={chip.removeHref}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-sm font-medium hover:bg-amber-100 transition"
        >
          <span>{chip.label}</span>
          <X className="w-3.5 h-3.5" />
        </Link>
      ))}
      <Link
        href="/professeurs"
        className="text-sm text-slate-500 underline hover:text-slate-700 ml-2"
      >
        Tout effacer
      </Link>
    </div>
  );
}

// Empty-state wrapper (preserves filters UI)
async function renderEmpty(props: any) {
  const {
    sp,
    q,
    subjectSlugs,
    classSlugs,
    verifiedOnly,
    sort,
    page,
    subjectsTaught,
    classesTaught,
    totalActive,
    totalVerified,
    totalResources,
    teacherCountFiltered,
  } = props;
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 pt-20">
        <section className="bg-gradient-to-br from-amber-50 to-orange-50 py-12">
          <div className="max-w-7xl mx-auto px-4">
            <h1 className="text-4xl font-extrabold mb-2">
              Nos <span className="gradient-text">professeurs</span>
            </h1>
            <p className="text-slate-600">
              {totalActive} enseignants · 0 résultats pour ces filtres
            </p>
          </div>
        </section>
        <section className="bg-white border-b sticky top-16 z-30">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <TeachersSearchBar initialQ={q} />
          </div>
        </section>
        <section className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-[280px_1fr] gap-8">
            <aside className="lg:sticky lg:top-32">
              <TeachersFilters
                subjects={subjectsTaught}
                classes={classesTaught}
                selectedSubjects={subjectSlugs}
                selectedClasses={classSlugs}
                verifiedOnly={verifiedOnly}
              />
            </aside>
            <EmptyState q={q} />
          </div>
        </section>
      </main>
      </div>
  );
}

// =====================================================================
// Helpers
// =====================================================================

function formatCount(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return `/professeurs${qs ? '?' + qs : ''}`;
}

function renderEmptyPage() {
  return (
    <div className="min-h-screen pt-24 px-4">
      <div className="max-w-7xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Professeurs</h1>
        <p className="text-slate-600">Page temporairement indisponible. Réessayez dans quelques instants.</p>
      </div>
    </div>
  );
}

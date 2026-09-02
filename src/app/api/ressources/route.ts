// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { RessourcesResponse } from '@/lib/facets';
import { getLevelClassIds } from '@/lib/level-cache';

export { type Facets, type RessourcesResponse } from '@/lib/facets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ============== HELPERS ==============
// opts.levelClassIds is optional — when provided, category filters use
// `classId IN [...]` (faster) instead of joining Resource→Class→Level.
// PERF 2026-08-09.
function buildWhere(
  filters: ParsedFilters,
  exclude: (keyof ParsedFilters)[] = [],
  opts: { levelClassIds?: { college: string[]; lycee: string[] } } = {},
): Prisma.ResourceWhereInput {
  const where: Prisma.ResourceWhereInput = { status: 'PUBLISHED' };

  if (!exclude.includes('q') && filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { description: { contains: filters.q, mode: 'insensitive' } },
      { summary: { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  if (!exclude.includes('type') && filters.type.length > 0) {
    where.type = { in: filters.type };
  }
  if (!exclude.includes('class') && filters.class.length > 0) {
    where.class = { slug: { in: filters.class } };
  }
  if (!exclude.includes('section') && filters.section.length > 0) {
    where.section = { slug: { in: filters.section } };
  }
  if (!exclude.includes('subject') && filters.subject.length > 0) {
    where.subject = { slug: { in: filters.subject } };
  }
  if (!exclude.includes('trimestre') && filters.trimestre.length > 0) {
    where.trimester = { in: filters.trimestre };
  }
  if (!exclude.includes('year') && filters.year.length > 0) {
    where.year = { in: filters.year };
  }
  if (!exclude.includes('language') && filters.language.length > 0) {
    where.language = { in: filters.language };
  }
  if (!exclude.includes('hasCorrection') && filters.hasCorrection) {
    where.hasCorrection = true;
  }
  if (!exclude.includes('teacherId') && filters.teacherId) {
    where.teacherId = filters.teacherId;
  }
  // 4 boolean category filters — converted to classId IN + schoolType IN.
  // PERF 2026-08-09: same change as /ressources page — pre-resolve classIds
  // by level (cached 5min) instead of joining Resource→Class→Level at
  // query time. ~2x faster.
  const collegeClassIds = opts.levelClassIds?.college ?? [];
  const lyceeClassIds = opts.levelClassIds?.lycee ?? [];

  const activeLevels: Array<'college' | 'lycee'> = [];
  const wantedSchoolTypes = new Set<string>();
  if (!exclude.includes('collegePilote') && filters.collegePilote) {
    activeLevels.push('college');
    wantedSchoolTypes.add('PILOTE');
  }
  if (!exclude.includes('collegeOrdinaire') && filters.collegeOrdinaire) {
    activeLevels.push('college');
    wantedSchoolTypes.add('PUBLIC');
    wantedSchoolTypes.add('LYCEE');
  }
  if (!exclude.includes('lyceePilote') && filters.lyceePilote) {
    activeLevels.push('lycee');
    wantedSchoolTypes.add('PILOTE');
  }
  if (!exclude.includes('lyceeOrdinaire') && filters.lyceeOrdinaire) {
    activeLevels.push('lycee');
    wantedSchoolTypes.add('PUBLIC');
    wantedSchoolTypes.add('LYCEE');
  }

  if (activeLevels.length > 0) {
    const uniqueLevels = Array.from(new Set(activeLevels));
    const allowedClassIds = uniqueLevels.flatMap((l) =>
      l === 'college' ? collegeClassIds : lyceeClassIds,
    );
    const schoolTypeList = Array.from(wantedSchoolTypes);
    if (allowedClassIds.length > 0 && collegeClassIds.length + lyceeClassIds.length > 0) {
      where.classId = { in: allowedClassIds };
    }
    if (schoolTypeList.length === 1) {
      where.schoolType = schoolTypeList[0];
    } else if (schoolTypeList.length > 1) {
      where.schoolType = { in: schoolTypeList };
    }
  }

  return where;
}

interface ParsedFilters {
  q: string;
  type: string[];
  class: string[];
  section: string[];
  subject: string[];
  trimestre: string[];
  year: string[];
  language: string[];
  hasCorrection: boolean;
  teacherId: string;
  // 4 combinable category filters
  collegePilote: boolean;
  collegeOrdinaire: boolean;
  lyceePilote: boolean;
  lyceeOrdinaire: boolean;
}

// ============== HANDLER ==============
export async function GET(req: NextRequest) {
  try {
  const { searchParams } = new URL(req.url);

  // Parse filters
  const filters: ParsedFilters = {
    q: searchParams.get('q') || '',
    type: searchParams.getAll('type'),
    class: searchParams.getAll('class'),
    section: searchParams.getAll('section'),
    subject: searchParams.getAll('subject'),
    trimestre: searchParams.getAll('trimestre'),
    year: searchParams.getAll('year'),
    language: searchParams.getAll('language'),
    hasCorrection: searchParams.get('hasCorrection') === '1',
    teacherId: searchParams.get('teacherId') || '',
    collegePilote: searchParams.get('collegePilote') === '1',
    collegeOrdinaire: searchParams.get('collegeOrdinaire') === '1',
    lyceePilote: searchParams.get('lyceePilote') === '1',
    lyceeOrdinaire: searchParams.get('lyceeOrdinaire') === '1',
  };

  const sort = searchParams.get('sort') || 'recent';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = 24;
  const skip = (page - 1) * pageSize;

  // PERF 2026-08-09: pre-fetch classIds by level once (cached 5min) so
  // buildWhere can use `classId IN [...]` instead of joining Class→Level
  // at query time. ~2x faster for the main count + findMany.
  const levelClassIds = await getLevelClassIds();
  const where = buildWhere(filters, [], { levelClassIds });

  // Convert teacherId from numericId to cuid (DB stores cuid on Resource.teacherId)
  // Accept both numericId (preferred, stable, exposed in URLs) and cuid (legacy)
  if (where.teacherId) {
    const teacherIdStr = String(where.teacherId);
    let resolvedCuid: string | null = null;
    if (/^\d+$/.test(teacherIdStr)) {
      const t = await prisma.user.findUnique({
        where: { numericId: parseInt(teacherIdStr, 10) },
        select: { id: true },
      });
      resolvedCuid = t?.id ?? null;
      if (!resolvedCuid) {
        // Maybe the input is actually a cuid (legacy URL)
        const t2 = await prisma.user.findUnique({
          where: { id: teacherIdStr },
          select: { id: true },
        });
        resolvedCuid = t2?.id ?? null;
      }
    } else {
      const t = await prisma.user.findUnique({
        where: { id: teacherIdStr },
        select: { id: true },
      });
      resolvedCuid = t?.id ?? null;
    }
    where.teacherId = resolvedCuid ?? '__no_match__';
  }

  // Build base where for facets (excludes search OR to avoid type conflicts)
  const facetBase: Prisma.ResourceWhereInput = { status: 'PUBLISHED' };
  if (filters.type.length > 0) facetBase.type = { in: filters.type };
  if (filters.class.length > 0) facetBase.class = { slug: { in: filters.class } };
  if (filters.section.length > 0) facetBase.section = { slug: { in: filters.section } };
  if (filters.subject.length > 0) facetBase.subject = { slug: { in: filters.subject } };
  if (filters.trimestre.length > 0) facetBase.trimester = { in: filters.trimestre };
  if (filters.year.length > 0) facetBase.year = { in: filters.year };
  if (filters.language.length > 0) facetBase.language = { in: filters.language };
  if (filters.hasCorrection) facetBase.hasCorrection = true;
  // PERF 2026-08-09: same classId IN + schoolType IN optimization as the
  // main where clause (see buildWhere).
  const facetActiveLevels: Array<'college' | 'lycee'> = [];
  const facetSchoolTypes = new Set<string>();
  if (filters.collegePilote) {
    facetActiveLevels.push('college');
    facetSchoolTypes.add('PILOTE');
  }
  if (filters.collegeOrdinaire) {
    facetActiveLevels.push('college');
    facetSchoolTypes.add('PUBLIC');
    facetSchoolTypes.add('LYCEE');
  }
  if (filters.lyceePilote) {
    facetActiveLevels.push('lycee');
    facetSchoolTypes.add('PILOTE');
  }
  if (filters.lyceeOrdinaire) {
    facetActiveLevels.push('lycee');
    facetSchoolTypes.add('PUBLIC');
    facetSchoolTypes.add('LYCEE');
  }
  if (facetActiveLevels.length > 0) {
    const uniqueLevels = Array.from(new Set(facetActiveLevels));
    const allowedClassIds = uniqueLevels.flatMap((l) =>
      l === 'college' ? levelClassIds.college : levelClassIds.lycee,
    );
    const schoolTypeList = Array.from(facetSchoolTypes);
    if (allowedClassIds.length > 0) {
      facetBase.classId = { in: allowedClassIds };
    }
    if (schoolTypeList.length === 1) {
      facetBase.schoolType = schoolTypeList[0];
    } else if (schoolTypeList.length > 1) {
      facetBase.schoolType = { in: schoolTypeList };
    }
  }
  if (filters.teacherId) {
    // Reuse the converted cuid from the main where clause
    facetBase.teacherId = where.teacherId as string;
  }

  // Sort
  let orderBy: Prisma.ResourceOrderByWithRelationInput = { publishedAt: 'desc' };
  if (sort === 'popular') orderBy = { viewsCount: 'desc' };
  else if (sort === 'downloads') orderBy = { downloadsCount: 'desc' };
  else if (sort === 'rating') orderBy = { ratingCount: 'desc' };
  else if (sort === 'oldest') orderBy = { publishedAt: 'asc' };

  // Run all queries in parallel
  // PERF: replaced `include: { subject, class, section, teacher, _count: {...} }`
  // (which triggers 6+ separate queries via Prisma's include engine) with
  // `select: { ... }` + 4 batched lookups.
  // Old approach: ~1000ms for the main findMany (N+1). New: ~180ms + 4× 50ms lookups = 380ms.
  // Net gain: ~620ms per request.
  const [resourcesRaw, total, byType, byTrimestre, byYear, byLanguage, withCorrectionCount, collegePiloteCount, collegeOrdinaireCount, lyceePiloteCount, lyceeOrdinaireCount] =
    await Promise.all([
      prisma.resource.findMany({
        where,
        take: pageSize,
        skip,
        orderBy,
        select: {
          // Resource scalars
          id: true,
          slug: true,
          numericId: true,
          title: true,
          description: true,
          summary: true,
          type: true,
          language: true,
          year: true,
          trimester: true,
          publishedAt: true,
          hasCorrection: true,
          schoolType: true,
          viewsCount: true,
          downloadsCount: true,
          avgRating: true,
          ratingCount: true,
          pageCount: true,
          fileSize: true,
          // Foreign keys (to batch-lookup related rows below)
          subjectId: true,
          classId: true,
          sectionId: true,
          teacherId: true,
          // _count for comments/ratings/favorites (1 extra query, used by display)
          _count: { select: { comments: true, ratings: true, favorites: true } },
        },
      }),
      prisma.resource.count({ where }),
      prisma.resource.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
      }),
      prisma.resource.groupBy({
        by: ['trimester'],
        where: { ...where, trimester: { not: null } },
        _count: { _all: true },
      }),
      prisma.resource.groupBy({
        by: ['year'],
        where: { ...where, year: { not: null } },
        _count: { _all: true },
        orderBy: { year: 'desc' },
      }),
      prisma.resource.groupBy({
        by: ['language'],
        where,
        _count: { _all: true },
      }),
      prisma.resource.count({ where: { ...where, hasCorrection: true } }),
      prisma.resource.count({ where: { ...where, class: { level: { slug: 'college' } }, schoolType: 'PILOTE' } }),
      prisma.resource.count({ where: { ...where, class: { level: { slug: 'college' } }, schoolType: { not: 'PILOTE' } } }),
      prisma.resource.count({ where: { ...where, class: { level: { slug: 'lycee' } }, schoolType: 'PILOTE' } }),
      prisma.resource.count({ where: { ...where, class: { level: { slug: 'lycee' } }, schoolType: { not: 'PILOTE' } } }),
    ]);

  // Fetch class/section/subject IDs separately (groupBy on nullable strings has TS issues)
  // PERF: use groupBy instead of findMany+JS-count — 3× scans of 13k+ rows became 3 small aggregate queries.
  // findMany+count was 700-800ms cold; groupBy is 5-15ms.
  const [classGroups, sectionGroups, subjectGroups] = await Promise.all([
    prisma.resource.groupBy({
      by: ['classId'],
      where: { ...facetBase, classId: { not: 'NONE' } },
      _count: { _all: true },
    }),
    prisma.resource.groupBy({
      by: ['sectionId'],
      where: { ...facetBase, sectionId: { not: 'NONE' } },
      _count: { _all: true },
    }),
    prisma.resource.groupBy({
      by: ['subjectId'],
      where: { ...facetBase, subjectId: { not: 'NONE' } },
      _count: { _all: true },
    }),
  ]);
  const classRecords = classGroups.map((g) => ({ classId: g.classId }));
  const sectionRecords = sectionGroups.map((g) => ({ sectionId: g.sectionId }));
  const subjectRecords = subjectGroups.map((g) => ({ subjectId: g.subjectId }));

  // Format simple facets
  const byTypeMap: Record<string, number> = {};
  byType.forEach((b) => {
    if (b.type && b._count && typeof b._count === 'object') byTypeMap[b.type] = b._count._all ?? 0;
  });

  const byTrimestreMap: Record<string, number> = {};
  byTrimestre.forEach((b) => {
    if (b.trimester && b._count && typeof b._count === 'object')
      byTrimestreMap[b.trimester] = b._count._all ?? 0;
  });

  const byYearMap: Record<string, number> = {};
  byYear.forEach((b) => {
    if (b.year && b._count && typeof b._count === 'object') byYearMap[b.year] = b._count._all ?? 0;
  });

  const byLanguageMap: Record<string, number> = {};
  byLanguage.forEach((b) => {
    if (b.language && b._count && typeof b._count === 'object')
      byLanguageMap[b.language] = b._count._all ?? 0;
  });

  // For class/section/subject facets: we now use the groupBy queries above
  // (classGroups, sectionGroups, subjectGroups) directly. No JS counting needed.

  // Batched lookups: pull teacher/subject/class/section in 4 parallel queries
  // (instead of Prisma's N+1 from `include`).
  // These IDs are typically <10 distinct values for 24 resources.
  const teacherIds = [...new Set(resourcesRaw.map((r) => r.teacherId).filter(Boolean))] as string[];
  const subjectIdsFromResources = [
    ...new Set(resourcesRaw.map((r) => r.subjectId).filter(Boolean)),
  ] as string[];
  const classIdsFromResources = [
    ...new Set(resourcesRaw.map((r) => r.classId).filter(Boolean)),
  ] as string[];
  const sectionIdsFromResources = [
    ...new Set(resourcesRaw.map((r) => r.sectionId).filter(Boolean)),
  ] as string[];

  const [teachersForResources, subjectsForResources, classesForResources, sectionsForResources] =
    await Promise.all([
      teacherIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: teacherIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              firstNameAr: true,
              lastNameAr: true,
              avatarUrl: true,
              schoolName: true,
            },
          })
        : Promise.resolve(
            [] as Array<{
              id: string;
              firstName: string | null;
              lastName: string | null;
              firstNameAr: string | null;
              lastNameAr: string | null;
              avatarUrl: string | null;
              schoolName: string | null;
            }>,
          ),
      subjectIdsFromResources.length > 0
        ? prisma.subject.findMany({
            where: { id: { in: subjectIdsFromResources } },
            select: { id: true, slug: true, nameFr: true, color: true },
          })
        : Promise.resolve(
            [] as Array<{ id: string; slug: string; nameFr: string; color: string | null }>,
          ),
      classIdsFromResources.length > 0
        ? prisma.class.findMany({
            where: { id: { in: classIdsFromResources } },
            select: { id: true, slug: true, nameFr: true },
          })
        : Promise.resolve([] as Array<{ id: string; slug: string; nameFr: string }>),
      sectionIdsFromResources.length > 0
        ? prisma.section.findMany({
            where: { id: { in: sectionIdsFromResources } },
            select: { id: true, slug: true, nameFr: true },
          })
        : Promise.resolve([] as Array<{ id: string; slug: string; nameFr: string }>),
    ]);

  // Stitch the relations back onto the resources (in-memory join, ~0ms)
  const teacherById = new Map(teachersForResources.map((t) => [t.id, t]));
  const subjectById = new Map(subjectsForResources.map((s) => [s.id, s]));
  const classByResourceId = new Map(classesForResources.map((c) => [c.id, c]));
  const sectionByResourceId = new Map(sectionsForResources.map((s) => [s.id, s]));

  const resources = resourcesRaw.map((r) => ({
    ...r,
    subject: subjectById.get(r.subjectId ?? '') ?? null,
    class: classByResourceId.get(r.classId ?? '') ?? null,
    section: sectionByResourceId.get(r.sectionId ?? '') ?? null,
    teacher: r.teacherId ? (teacherById.get(r.teacherId) ?? null) : null,
  }));

  // Resolve class slugs (for facet lookups, distinct from resource lookups)
  const classIds = classGroups.map((g) => g.classId).filter((id): id is string => !!id);
  const sectionIds = sectionGroups.map((g) => g.sectionId).filter((id): id is string => !!id);
  const subjectIds = subjectGroups.map((g) => g.subjectId).filter((id): id is string => !!id);

  const [classes, sections, subjects, allClasses, allSections, allSubjects] = await Promise.all([
    classIds.length > 0
      ? prisma.class.findMany({
          where: { id: { in: classIds } },
          select: { id: true, slug: true, nameFr: true },
        })
      : Promise.resolve([] as Array<{ id: string; slug: string; nameFr: string }>),
    sectionIds.length > 0
      ? prisma.section.findMany({
          where: { id: { in: sectionIds } },
          select: { id: true, slug: true, nameFr: true },
        })
      : Promise.resolve([] as Array<{ id: string; slug: string; nameFr: string }>),
    subjectIds.length > 0
      ? prisma.subject.findMany({
          where: { id: { in: subjectIds } },
          select: { id: true, slug: true, nameFr: true, color: true },
        })
      : Promise.resolve(
          [] as Array<{ id: string; slug: string; nameFr: string; color: string | null }>,
        ),
    // Always load ALL classes/sections/subjects for the display name maps
    // (used to display 'Sciences' instead of 'sciences' in the filter)
    prisma.class.findMany({ select: { slug: true, nameFr: true } }),
    prisma.section.findMany({ select: { slug: true, nameFr: true } }),
    prisma.subject.findMany({ select: { slug: true, nameFr: true } }),
  ]);

  // Build facet maps: slug -> count
  const byClassMap: Record<string, number> = {};
  classGroups.forEach((g) => {
    const c = classes.find((x) => x.id === g.classId);
    if (c && g._count && typeof g._count === 'object') byClassMap[c.slug] = g._count._all ?? 0;
  });

  const bySectionMap: Record<string, number> = {};
  sectionGroups.forEach((g) => {
    const s = sections.find((x) => x.id === g.sectionId);
    if (s && g._count && typeof g._count === 'object') bySectionMap[s.slug] = g._count._all ?? 0;
  });

  const bySubjectMap: Record<string, number> = {};
  subjectGroups.forEach((g) => {
    const s = subjects.find((x) => x.id === g.subjectId);
    if (s && g._count && typeof g._count === 'object') bySubjectMap[s.slug] = g._count._all ?? 0;
  });

  const response: RessourcesResponse = {
    resources,
    total,
    totalPages: Math.ceil(total / pageSize),
    currentPage: page,
    facets: {
      byType: byTypeMap,
      byTrimestre: byTrimestreMap,
      byYear: byYearMap,
      byLanguage: byLanguageMap,
      byClass: byClassMap,
      bySection: bySectionMap,
      bySubject: bySubjectMap,
      withCorrection: withCorrectionCount,
      collegePilote: collegePiloteCount,
      collegeOrdinaire: collegeOrdinaireCount,
      lyceePilote: lyceePiloteCount,
      lyceeOrdinaire: lyceeOrdinaireCount,
    },
    nameMaps: {
      class: Object.fromEntries(allClasses.map((c) => [c.slug, c.nameFr])),
      section: Object.fromEntries(allSections.map((s) => [s.slug, s.nameFr])),
      subject: Object.fromEntries(allSubjects.map((s) => [s.slug, s.nameFr])),
    },
  };

  return NextResponse.json(response);
  } catch (err: any) {
    console.error('[api/ressources] error:', err?.message || err);
    return NextResponse.json(
      { error: 'Internal server error', message: err?.message || 'Unknown', code: err?.code },
      { status: 500 }
    );
  }
}
// updated Fri Jul 17 00:15:17 UTC 2026

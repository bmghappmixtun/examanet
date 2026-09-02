import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cachedD1Query } from '@/lib/kv-cache';

/**
 * GET /api/ressources-data
 *
 * Returns ALL data needed by /fr/ressources page:
 * - 24 resources with subject/class/teacher joined (1 query)
 * - Total count (1 query)
 * - Facet counts (1 query, GROUP BY in JS)
 * - Class/Section/Subject lists (1 query each, KV-cached)
 *
 * PERF 2026-09-02 (Step 2):
 * - Removed duplicate facets query (was run twice, once unused)
 * - Wrapped the FULL response in KV cache (60s TTL, by filter hash)
 * - Run resources + count + facets in parallel with Promise.all
 * - Lookup tables already KV-cached at 1h TTL
 *
 * Cache strategy:
 * - No filter / popular filter combos: KV cached 60s
 * - Random filter combos: KV cached 30s (smaller TTL since rare)
 * - CDN cache headers: still set as second layer of defense
 */

const CACHE_TTL_DEFAULT = 60; // seconds
const CACHE_TTL_RARE = 30; // for uncommon filter combinations

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    if (!db) {
      return NextResponse.json({ error: 'DB not available' }, { status: 503 });
    }

    // Parse filters (and sort them for stable cache keys)
    const q = (sp.get('q') || '').toLowerCase().trim();
    const type = sp.getAll('type').sort();
    const classSlug = sp.getAll('class').sort();
    const section = sp.getAll('section').sort();
    const subject = sp.getAll('subject').sort();
    const trimestre = sp.getAll('trimestre').sort();
    const year = sp.getAll('year').sort();
    const language = sp.getAll('language').sort();
    const hasCorrection = sp.get('hasCorrection') === '1';
    const collegePilote = sp.get('collegePilote') === '1';
    const collegeOrdinaire = sp.get('collegeOrdinaire') === '1';
    const lyceePilote = sp.get('lyceePilote') === '1';
    const lyceeOrdinaire = sp.get('lyceeOrdinaire') === '1';
    const teacherIdNumeric = sp.get('teacherId') || '';
    const sort = sp.get('sort') || 'recent';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const PAGE_SIZE = 24;

    // Build stable cache key from normalized filter values
    // Format: "d1:rdata-v1-{hash}"
    const filterKey = [
      `q=${q}`,
      `t=${type.join(',')}`,
      `c=${classSlug.join(',')}`,
      `s=${section.join(',')}`,
      `sub=${subject.join(',')}`,
      `tri=${trimestre.join(',')}`,
      `y=${year.join(',')}`,
      `l=${language.join(',')}`,
      `hc=${hasCorrection ? 1 : 0}`,
      `cp=${collegePilote ? 1 : 0}`,
      `co=${collegeOrdinaire ? 1 : 0}`,
      `lp=${lyceePilote ? 1 : 0}`,
      `lo=${lyceeOrdinaire ? 1 : 0}`,
      `tid=${teacherIdNumeric}`,
      `sort=${sort}`,
      `p=${page}`,
    ].join('&');
    // Hash the filter key for compactness (FNV-1a 32-bit)
    // Note: cachedD1Query adds "d1:" prefix automatically, so use just "rdata-v1-..."
    const cacheKey = `rdata-v1-${fnv1a(filterKey).toString(16)}`;

    // Determine if this is a "rare" filter combination (gets shorter TTL)
    const hasFilters = q || type.length || subject.length || classSlug.length || section.length || trimestre.length || year.length || language.length || hasCorrection || teacherIdNumeric;
    const ttl = hasFilters ? CACHE_TTL_RARE : CACHE_TTL_DEFAULT;

    // Wrap the full response in KV cache
    const responseData = await cachedD1Query({
      key: cacheKey,
      ttl,
      query: async () => {
        return await fetchRessourcesData({
          db, q, type, classSlug, section, subject, trimestre, year, language,
          hasCorrection, collegePilote, collegeOrdinaire, lyceePilote, lyceeOrdinaire,
          teacherIdNumeric, sort, page, PAGE_SIZE,
        });
      },
      // isDataObject: the result is an object (not D1 .all() shape)
      // We handle serialization ourselves since it's already a plain object
      transformResult: (raw: any) => raw,
    });

    const response = NextResponse.json(responseData);

    // CDN cache headers as second layer (CF edge cache)
    response.headers.set('Cache-Control', hasFilters
      ? 'public, max-age=10, s-maxage=30, stale-while-revalidate=60'
      : 'public, max-age=30, s-maxage=120, stale-while-revalidate=300');

    // Add a header to indicate cache hit status (useful for debugging)
    response.headers.set('X-Cache-Key', cacheKey);
    return response;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e), resources: [], total: 0 },
      { status: 500 }
    );
  }
}

/**
 * Fetch the full data response (uncached).
 * Returns the complete JSON payload as a plain object.
 */
async function fetchRessourcesData(opts: any) {
  const {
    db, q, type, classSlug, section, subject, trimestre, year, language,
    hasCorrection, collegePilote, collegeOrdinaire, lyceePilote, lyceeOrdinaire,
    teacherIdNumeric, sort, page, PAGE_SIZE,
  } = opts;

  // Build WHERE clauses
  const conditions: string[] = ["r.status = 'PUBLISHED'"];
  const params: any[] = [];

  if (q) {
    conditions.push("(r.title LIKE ? OR r.description LIKE ? OR r.summary LIKE ?)");
    const qParam = `%${q}%`;
    params.push(qParam, qParam, qParam);
  }
  if (type.length > 0) {
    conditions.push(`r.type IN (${type.map(() => '?').join(',')})`);
    params.push(...type);
  }
  if (trimestre.length > 0) {
    conditions.push(`r.trimester IN (${trimestre.map(() => '?').join(',')})`);
    params.push(...trimestre);
  }
  if (year.length > 0) {
    conditions.push(`r.year IN (${year.map(() => '?').join(',')})`);
    params.push(...year);
  }
  if (language.length > 0) {
    conditions.push(`r.language IN (${language.map(() => '?').join(',')})`);
    params.push(...language);
  }
  if (subject.length > 0) {
    conditions.push(`s.slug IN (${subject.map(() => '?').join(',')})`);
    params.push(...subject);
  }
  if (hasCorrection) conditions.push("r.hasCorrection = 1");
  if (collegePilote) conditions.push("r.schoolType = 'COLLEGE_PILOTE'");
  if (collegeOrdinaire) conditions.push("r.schoolType = 'COLLEGE_ORDINAIRE'");
  if (lyceePilote) conditions.push("r.schoolType = 'LYCEE_PILOTE'");
  if (lyceeOrdinaire) conditions.push("r.schoolType = 'LYCEE_ORDINAIRE'");

  // Always LEFT JOIN `Class` and `Section` for the resource cards
  const joinClass = 'LEFT JOIN `Class` cls ON r.classId = cls.id LEFT JOIN `Section` sec ON r.sectionId = sec.id';
  if (classSlug.length > 0) {
    conditions.push(`cls.slug IN (${classSlug.map(() => '?').join(',')})`);
    params.push(...classSlug);
  }
  if (section.length > 0) {
    conditions.push(`sec.slug IN (${section.map(() => '?').join(',')})`);
    params.push(...section);
  }

  // Teacher filter: URL has numericId, DB has D1 internal ID
  if (teacherIdNumeric) {
    const teacherRow: any = await db.prepare(
      'SELECT id FROM User WHERE numericId = ? AND role = \'TEACHER\' LIMIT 1'
    ).bind(parseInt(teacherIdNumeric, 10)).first();
    if (teacherRow) {
      conditions.push('r.teacherId = ?');
      params.push(teacherRow.id);
    } else {
      conditions.push('1 = 0'); // Teacher not found, return empty
    }
  }

  const orderBy = sort === 'popular' ? 'r.viewsCount DESC' :
                  sort === 'downloads' ? 'r.downloadsCount DESC' :
                  sort === 'rating' ? 'r.ratingsCount DESC' :
                  sort === 'oldest' ? 'r.publishedAt ASC' :
                  'r.publishedAt DESC';

  const whereClause = conditions.join(' AND ');
  const offset = (page - 1) * PAGE_SIZE;

  // Run resources + count + facets in PARALLEL (was sequential before)
  // PERF 2026-09-02: Removed duplicate facets query (was run twice)
  const resourcesSql = [
    'SELECT',
    '  r.id, r.slug, r.numericId, r.title, r.description, r.summary,',
    '  r.type, r.language, r.year, r.trimester, r.publishedAt,',
    '  r.hasCorrection, r.schoolType, r.viewsCount, r.downloadsCount,',
    '  r.avgRating, r.ratingsCount, r.pageCount, r.fileSize,',
    '  r.subjectId, r.classId, r.sectionId, r.teacherId,',
    '  s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.color as s_color, s.icon as s_icon,',
    '  cls.id as c_id, cls.slug as c_slug, cls.nameFr as c_nameFr,',
    '  sec.id as sec_id, sec.slug as sec_slug, sec.nameFr as sec_nameFr,',
    '  t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName,',
    '  t.firstNameAr as t_firstNameAr, t.lastNameAr as t_lastNameAr,',
    '  t.avatarUrl as t_avatarUrl, t.schoolName as t_schoolName',
    'FROM Resource r',
    'LEFT JOIN `Subject` s ON r.subjectId = s.id',
    'LEFT JOIN `User` t ON r.teacherId = t.id',
    joinClass,
    'WHERE ' + whereClause,
    'ORDER BY ' + orderBy,
    'LIMIT ? OFFSET ?',
  ].join('\n');

  const countSql = "SELECT COUNT(*) as total FROM Resource r LEFT JOIN `Subject` s ON r.subjectId = s.id " + joinClass + " WHERE " + whereClause;
  const facetSql = "SELECT r.classId as r_classId, r.sectionId as r_sectionId, r.subjectId as r_subjectId, r.type, r.trimester, r.year, r.language, r.hasCorrection, r.schoolType FROM Resource r LEFT JOIN `Subject` s ON r.subjectId = s.id " + joinClass + " WHERE " + whereClause;

  // 3 queries in parallel + 3 lookup tables (KV cached)
  const [resources, countResult, facetsRaw, allClasses, allSections, allSubjects] = await Promise.all([
    db.prepare(resourcesSql).bind(...params, PAGE_SIZE, offset).all(),
    db.prepare(countSql).bind(...params).first(),
    db.prepare(facetSql).bind(...params).all(),
    cachedD1Query({
      key: 'all-classes-v1',
      ttl: 3600,
      query: () => db.prepare("SELECT id, slug, nameFr, nameAr, levelId FROM `Class`").all(),
    }),
    cachedD1Query({
      key: 'all-sections-v1',
      ttl: 3600,
      query: () => db.prepare("SELECT id, slug, nameFr, nameAr, numericId FROM `Section`").all(),
    }),
    cachedD1Query({
      key: 'all-subjects-v1',
      ttl: 3600,
      query: () => db.prepare("SELECT id, slug, nameFr, nameAr, color, icon FROM `Subject`").all(),
    }),
  ]);

  const total = countResult?.total || 0;
  const facets = facetsRaw?.results || facetsRaw || [];

  // Aggregate facets in JS
  const byType: Record<string, number> = {};
  const byTrimestre: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};
  let withCorrection = 0;
  const classCounts = new Map<string, number>();
  const sectionCounts = new Map<string, number>();
  const subjectCounts = new Map<string, number>();

  // Build lookup maps
  const classMap = new Map<string, any>();
  for (const c of (allClasses?.results || [])) classMap.set(c.id, c);
  const sectionMap = new Map<string, any>();
  for (const s of (allSections?.results || [])) sectionMap.set(s.id, s);
  const subjectMap = new Map<string, any>();
  for (const s of (allSubjects?.results || [])) subjectMap.set(s.id, s);

  for (const r of facets) {
    if (r.type) byType[r.type] = (byType[r.type] || 0) + 1;
    if (r.trimester) byTrimestre[r.trimester] = (byTrimestre[r.trimester] || 0) + 1;
    if (r.year) byYear[r.year] = (byYear[r.year] || 0) + 1;
    if (r.language) byLanguage[r.language] = (byLanguage[r.language] || 0) + 1;
    if (r.hasCorrection) withCorrection++;
    if (r.r_classId) {
      const c = classMap.get(r.r_classId);
      if (c) classCounts.set(c.slug, (classCounts.get(c.slug) || 0) + 1);
    }
    if (r.r_sectionId) {
      const sec = sectionMap.get(r.r_sectionId);
      if (sec) sectionCounts.set(sec.slug, (sectionCounts.get(sec.slug) || 0) + 1);
    }
    if (r.r_subjectId) {
      const sub = subjectMap.get(r.r_subjectId);
      if (sub) subjectCounts.set(sub.slug, (subjectCounts.get(sub.slug) || 0) + 1);
    }
  }

  // Format resources with joined data
  const resourcesList = resources?.results || resources || [];
  const formattedResources = resourcesList.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    numericId: r.numericId,
    title: r.title,
    description: r.description,
    summary: r.summary,
    type: r.type,
    language: r.language,
    year: r.year,
    trimester: r.trimester,
    publishedAt: r.publishedAt,
    hasCorrection: !!r.hasCorrection,
    schoolType: r.schoolType,
    viewsCount: r.viewsCount || 0,
    downloadsCount: r.downloadsCount || 0,
    avgRating: r.avgRating || 0,
    ratingCount: r.ratingsCount || 0,
    pageCount: r.pageCount,
    fileSize: r.fileSize,
    subjectId: r.subjectId,
    classId: r.classId,
    sectionId: r.sectionId,
    teacherId: r.teacherId,
    subject: r.s_id ? { slug: r.s_slug, nameFr: r.s_nameFr, color: r.s_color, icon: r.s_icon } : null,
    class: r.c_id ? { slug: r.c_slug, nameFr: r.c_nameFr } : null,
    section: r.sec_id ? { slug: r.sec_slug, nameFr: r.sec_nameFr } : null,
    teacher: r.t_id ? {
      firstName: r.t_firstName,
      lastName: r.t_lastName,
      firstNameAr: r.t_firstNameAr,
      lastNameAr: r.t_lastNameAr,
      avatarUrl: r.t_avatarUrl,
      schoolName: r.t_schoolName,
    } : null,
  }));

  return {
    resources: formattedResources,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
    currentPage: page,
    facets: {
      byType,
      byTrimestre,
      byYear,
      byLanguage,
      withCorrection,
      byClass: Object.fromEntries(classCounts),
      bySection: Object.fromEntries(sectionCounts),
      bySubject: Object.fromEntries(subjectCounts),
    },
    nameMaps: {
      class: Object.fromEntries((allClasses?.results || []).map((c: any) => [c.slug, c.nameFr])),
      section: Object.fromEntries((allSections?.results || []).map((s: any) => [s.slug, s.nameFr])),
      subject: Object.fromEntries((allSubjects?.results || []).map((s: any) => [s.slug, s.nameFr])),
    },
  };
}

/**
 * FNV-1a 32-bit hash. Fast and good enough for cache keys.
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

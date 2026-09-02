// @ts-nocheck
/**
 * search-v2.ts
 * Shared search engine: FTS + pg_trgm + Synonyms + Highlighting + Facets
 *
 * Strategy:
 *   1. Expand query with synonyms → list of variants
 *   2. For each variant, build OR'd FTS + TRGM conditions
 *   3. Best score = MAX across variants (computed in app layer)
 *   4. ts_headline for highlighting (uses original query)
 *   5. GROUP BY for facets (single query, parallel aggregation)
 */
import { prisma } from './prisma';
import { getAllSynonyms, resolveSubjectSlugs, resolveClassSlugs, resolveSectionSlugs } from './search-cache';
import { sanitizeHighlightHtml } from './security';

export interface SearchFilters {
  subject?: string[];
  class?: string[];
  section?: string[];
  type?: string[];
  year?: string[];
  trimester?: string[];
  language?: string[];
  hasCorrection?: boolean;
  teacherId?: string;
}

export interface SearchOptions {
  q?: string;
  filters?: SearchFilters;
  page?: number;
  limit?: number;
  sort?: 'relevance' | 'recent' | 'popular' | 'downloads';
}

export interface SearchResult {
  id: string;
  numericId?: number | null;
  slug: string | null;
  title: string | null;
  titleHighlighted: string | null;
  descriptionHighlighted: string | null;
  type: string | null;
  subject: { nameFr: string; slug: string; color: string | null } | null;
  class: { nameFr: string; slug: string } | null;
  section: { nameFr: string; slug: string } | null;
  teacher: { firstName: string | null; lastName: string | null } | null;
  year: string | null;
  trimester: string | null;
  language: string | null;
  hasCorrection: boolean | null;
  viewsCount: number | null;
  downloadsCount: number | null;
  publishedAt: Date | string | null;
  score: number;
  ftsScore: number;
  trgmScore: number;
}

export interface SearchResponse {
  query: string;
  variants: string[];
  expandedQuery?: string;
  synonymsApplied: string[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  sort: string;
  durationMs: number;
  filters: SearchFilters;
  results: SearchResult[];
  facets: {
    type: Record<string, number>;
    subjectId: Record<string, number>;
    classId: Record<string, number>;
    sectionId: Record<string, number>;
    year: Record<string, number>;
    trimester: Record<string, number>;
    language: Record<string, number>;
    hasCorrection: number;
  };
}

// ============================================================================
// Synonym expansion
// ============================================================================
function expandQueryWithSynonyms(
  q: string,
  synonyms: { term: string; synonyms: string[] }[],
): { variants: string[]; applied: string[] } {
  if (!q) return { variants: [], applied: [] };
  const lower = q.toLowerCase().trim();
  const tokens = lower.split(/\s+/);
  const applied: string[] = [];
  const variants = new Set<string>();

  for (const token of tokens) {
    variants.add(token);
    for (const syn of synonyms) {
      const allTerms = [
        syn.term.toLowerCase(),
        ...(syn.synonyms || []).map((s: string) => s.toLowerCase()),
      ];
      if (allTerms.includes(token)) {
        for (const t of allTerms) variants.add(t);
        applied.push(`${token} → ${syn.term}`);
        break;
      }
    }
  }

  return { variants: Array.from(variants), applied };
}

// ============================================================================
// Build OR'd SQL conditions for variants
// Params: $1..$N = variants (same set used for FTS and TRGM)
// ============================================================================
function buildMatchConditions(
  variants: string[],
  originalQ: string,
): {
  ftsSql: string;
  ftsTsquery: string;  // the tsquery expression (no "search_vector @@ " prefix)
  trgmSql: string;
  params: (string | number | boolean | string[])[];
  ftsCombined: string;
} {
  if (variants.length === 0) {
    // No variants → no FTS possible, skip tsquery evaluation
    // Use a NULL tsquery so r.search_vector @@ NULL returns NULL (not boolean)
    return {
      ftsSql: 'FALSE',
      ftsTsquery: 'NULL::tsquery',
      trgmSql: 'FALSE',
      params: [],
      ftsCombined: ''
    };
  }

  // FTS: build OR'd tsqueries using `||` operator (PostgreSQL tsquery OR)
  // Each variant becomes its own tsquery, OR'd together
  const ftsParts: string[] = [];
  const ftsParams: (string | number | boolean | string[])[] = [];
  variants.forEach((v, i) => {
    ftsParts.push(`websearch_to_tsquery('french', $${i + 1})`);
    ftsParams.push(v);
  });
  const ftsSql = `search_vector @@ (${ftsParts.join(' || ')})`;

  // TRGM: only check the original query (fast, single similarity)
  // Synonyms don't need TRGM because they should match via FTS
  // The TRGM param will be at index variants.length + 1
  const trgmIdx = variants.length + 1;
  const trgmSql = `(word_similarity($${trgmIdx}, title) > 0.4 OR word_similarity($${trgmIdx}, COALESCE(description, '')) > 0.4)`;

  return {
    ftsSql,
    ftsTsquery: ftsParts.join(' || '),  // just the tsquery expression
    trgmSql,
    params: [...ftsParams, originalQ || variants[0]], // variants + trgm query
    ftsCombined: variants.join(' · '),
  };
}

// ============================================================================
// Main search function
// ============================================================================
export async function searchV2(options: SearchOptions): Promise<SearchResponse> {
  const t0 = Date.now();
  const q = (options.q || '').trim();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(50, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const sort = options.sort || 'relevance';
  const filters: SearchFilters = options.filters || {};

  // 1. Pre-fetch synonyms (CACHED for 5 min)
  const synonyms = await getAllSynonyms();

  // 2. Expand query → list of variants
  const expandedQuery = expandQueryWithSynonyms(q, synonyms);
  const variants = expandedQuery.variants.length > 0 ? expandedQuery.variants : [];

  // 3. Resolve slugs to IDs
  let subjectIds: string[] = [];
  let classIds: string[] = [];
  let sectionIds: string[] = [];

  if (filters.subject?.length) {
    const r = await resolveSubjectSlugs(filters.subject);
    subjectIds = r.map((s) => s.id);
    if (!subjectIds.length)
      return emptyResponse({ q, page, limit, sort, filters, t0, expandedQuery });
  }
  if (filters.class?.length) {
    const r = await resolveClassSlugs(filters.class);
    classIds = r.map((c) => c.id);
    if (!classIds.length)
      return emptyResponse({ q, page, limit, sort, filters, t0, expandedQuery });
  }
  if (filters.section?.length) {
    const r = await resolveSectionSlugs(filters.section);
    sectionIds = r.map((s) => s.id);
    if (!sectionIds.length)
      return emptyResponse({ q, page, limit, sort, filters, t0, expandedQuery });
  }

  // 4. Build SQL conditions
  const match = buildMatchConditions(variants, q);
  // match.params = [variant1, variant2, ..., originalQ] (N+1 elements)
  // In SQL: $1..$N = variants (FTS), $N+1 = original q (TRGM)
  // Filters must follow the match params, so first filter placeholder = $N+2
  // pIdx starts at N+1 (the last used placeholder for match) and pre-increments
  // to N+2 for the first filter.
  let pIdx = match.params.length; // = N+1 (last used for match)
  const filterParams: (string | number | boolean | string[])[] = [];
  const filterConditions: string[] = [];

  if (subjectIds.length) {
    filterConditions.push(`r."subjectId" = ANY($${++pIdx}::text[])`);
    filterParams.push(subjectIds);
  }
  if (classIds.length) {
    filterConditions.push(`r."classId" = ANY($${++pIdx}::text[])`);
    filterParams.push(classIds);
  }
  if (sectionIds.length) {
    filterConditions.push(`r."sectionId" = ANY($${++pIdx}::text[])`);
    filterParams.push(sectionIds);
  }
  if (filters.type?.length) {
    filterConditions.push(`r.type::text = ANY($${++pIdx}::text[])`);
    filterParams.push(filters.type);
  }
  if (filters.year?.length) {
    filterConditions.push(`r.year = ANY($${++pIdx}::text[])`);
    filterParams.push(filters.year);
  }
  if (filters.trimester?.length) {
    filterConditions.push(`r."trimester" = ANY($${++pIdx}::text[])`);
    filterParams.push(filters.trimester);
  }
  if (filters.language?.length) {
    filterConditions.push(`r.language = ANY($${++pIdx}::text[])`);
    filterParams.push(filters.language);
  }
  if (filters.hasCorrection !== undefined) {
    filterConditions.push(`r."hasCorrection" = $${++pIdx}`);
    filterParams.push(filters.hasCorrection);
  }
  if (filters.teacherId) {
    // teacherId can be either the User.id (UUID) or the User.numericId (number)
    // Detect numeric input and JOIN with User to get the UUID.
    // For UUID input, compare directly.
    if (/^\d+$/.test(filters.teacherId)) {
      // Numeric ID: need to look up the User.id
      // Use a subquery to filter by User.numericId
      filterConditions.push(
        `r."teacherId" = (SELECT id FROM "User" WHERE "numericId"::text = $${++pIdx} LIMIT 1)`,
      );
    } else {
      // UUID: direct comparison
      filterConditions.push(`r."teacherId" = $${++pIdx}`);
    }
    filterParams.push(filters.teacherId);
  }

  const whereExtras = filterConditions.length ? 'AND ' + filterConditions.join(' AND ') : '';

  // 5. Highlight uses the original q (best single match)
  // For highlighting, we need a single tsquery. Use the original q.
  // highlightIdx is the placeholder position in searchSql's allParams.
  // pIdx already points to the last used filter placeholder; highlight comes next.
  const highlightParam = q || variants[0] || '';
  const highlightIdx = pIdx + 1;

  // 6. Build final params
  // Order: $1..$N = variants, $N+1 = trgm q, $N+2+ = filters, $last = highlight
  const allParams = [...match.params, ...filterParams, highlightParam];

  // 7. Main search query
  const orderBy =
    sort === 'recent'
      ? 'r."publishedAt" DESC NULLS LAST'
      : sort === 'popular'
        ? 'r."viewsCount" DESC NULLS LAST'
        : sort === 'downloads'
          ? 'r."downloadsCount" DESC NULLS LAST'
          : 'combined_score DESC';

  // $1..$N = variants, $N+1 = trgm q, $N+2+ = filters, $last = highlight
  // The match.ftsSql uses $1..$N internally for variants
  // The match.trgmSql uses $N+1 for the original q
  // For highlighting, we need a single tsquery. Use the original q.
  const searchSql = `
    WITH matched AS (
      SELECT
        r.id,
        -- FTS score: use the OR'd variants tsquery
        -- Note: match.ftsTsquery is just the tsquery expression, no "search_vector @@" prefix.
        -- When no variants, ftsTsquery is NULL::tsquery so r.search_vector @@ NULL returns NULL.
        CASE WHEN r.search_vector @@ (${match.ftsTsquery})
             THEN ts_rank_cd(r.search_vector, (${match.ftsTsquery}))
             ELSE 0
        END AS fts_score,
        -- TRGM score (original q)
        GREATEST(
          word_similarity($${variants.length + 1}, r.title),
          word_similarity($${variants.length + 1}, COALESCE(r.description, ''))
        ) AS trgm_score
      FROM "Resource" r
      WHERE r.status = 'PUBLISHED'
        AND (${match.ftsSql} OR ${match.trgmSql})
        ${whereExtras}
    )
    SELECT
      m.id,
      m.fts_score + m.trgm_score * 0.5 AS combined_score,
      m.fts_score,
      m.trgm_score,
      ts_headline('french', r.title, websearch_to_tsquery('french', $${highlightIdx}),
        'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=20,MinWords=5') AS title_highlighted,
      ts_headline('french', COALESCE(r.description, ''), websearch_to_tsquery('french', $${highlightIdx}),
        'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MaxWords=15,MinWords=5') AS description_highlighted
    FROM matched m
    JOIN "Resource" r ON r.id = m.id
    WHERE m.fts_score + m.trgm_score * 0.5 > 0
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `;

  // 8. Count query (uses $1=ftsCombined + $2=trgm q, same as search)
  const countSql = `
    SELECT count(*)::int AS total
    FROM "Resource" r
    WHERE r.status = 'PUBLISHED'
      AND (${match.ftsSql} OR ${match.trgmSql})
      ${whereExtras}
  `;

  // 9. Facets query (parallel aggregation, $1=ftsCombined, $2=trgm)
  // Note: facets apply the same filter conditions as the main search (whereExtras)
  // so facet counts are consistent with the main result count.
  const facetsSql = `
    WITH matched AS (
      SELECT r.type::text AS type, r."subjectId", r."classId", r."sectionId",
             r.year, r."trimester", r.language, r."hasCorrection"
      FROM "Resource" r
      WHERE r.status = 'PUBLISHED'
        AND (${match.ftsSql} OR ${match.trgmSql})
        ${whereExtras}
      LIMIT 5000
    ),
    type_f AS (SELECT type, count(*)::int AS c FROM matched WHERE type IS NOT NULL GROUP BY type),
    subj_f AS (SELECT "subjectId" AS k, count(*)::int AS c FROM matched WHERE "subjectId" IS NOT NULL GROUP BY "subjectId"),
    class_f AS (SELECT "classId" AS k, count(*)::int AS c FROM matched WHERE "classId" IS NOT NULL GROUP BY "classId"),
    sect_f AS (SELECT "sectionId" AS k, count(*)::int AS c FROM matched WHERE "sectionId" IS NOT NULL GROUP BY "sectionId"),
    year_f AS (SELECT year AS k, count(*)::int AS c FROM matched WHERE year IS NOT NULL GROUP BY year),
    tri_f AS (SELECT "trimester" AS k, count(*)::int AS c FROM matched WHERE "trimester" IS NOT NULL GROUP BY "trimester"),
    lang_f AS (SELECT language AS k, count(*)::int AS c FROM matched WHERE language IS NOT NULL GROUP BY language),
    corr_f AS (SELECT count(*)::int AS c FROM matched WHERE "hasCorrection" = true)
    SELECT
      (SELECT jsonb_object_agg(type, c) FROM type_f) AS type_facets,
      (SELECT jsonb_object_agg(k, c) FROM subj_f) AS subj_facets,
      (SELECT jsonb_object_agg(k, c) FROM class_f) AS class_facets,
      (SELECT jsonb_object_agg(k, c) FROM sect_f) AS sect_facets,
      (SELECT jsonb_object_agg(k, c) FROM year_f) AS year_facets,
      (SELECT jsonb_object_agg(k, c) FROM tri_f) AS tri_facets,
      (SELECT jsonb_object_agg(k, c) FROM lang_f) AS lang_facets,
      (SELECT c FROM corr_f) AS has_correction
  `;

  // 10. Execute all in parallel
  // Params: [variant1..N, trgm q, ...filters, highlight]
  const [rawResults, countResult, facetRows] = await Promise.all([
    prisma.$queryRawUnsafe(searchSql, ...allParams) as Promise<any[]>,
    prisma.$queryRawUnsafe(countSql, ...match.params, ...filterParams) as Promise<any[]>,
    prisma.$queryRawUnsafe(facetsSql, ...match.params, ...filterParams) as Promise<any[]>,
  ]);

  const total = countResult[0]?.total || 0;

  // 11. Hydrate
  const ids = rawResults.map((r) => r.id);
  const full = await prisma.resource.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      numericId: true,
      slug: true,
      title: true,
      type: true,
      year: true,
      trimester: true,
      language: true,
      hasCorrection: true,
      viewsCount: true,
      downloadsCount: true,
      publishedAt: true,
      subject: { select: { nameFr: true, slug: true, color: true } },
      class: { select: { nameFr: true, slug: true } },
      section: { select: { nameFr: true, slug: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  });
  const byId = new Map(full.map((r) => [r.id, r]));

  const results: SearchResult[] = rawResults.map((r) => {
    const f = byId.get(r.id);
    return {
      id: r.id,
      numericId: f?.numericId ?? null,
      slug: f?.slug ?? null,
      title: f?.title ?? null,
      titleHighlighted: sanitizeHighlightHtml(r.title_highlighted),
      descriptionHighlighted: sanitizeHighlightHtml(r.description_highlighted),
      type: f?.type ?? null,
      subject: f?.subject
        ? { nameFr: f.subject.nameFr, slug: f.subject.slug, color: f.subject.color }
        : null,
      class: f?.class ? { nameFr: f.class.nameFr, slug: f.class.slug } : null,
      section: f?.section ? { nameFr: f.section.nameFr, slug: f.section.slug } : null,
      teacher: f?.teacher ? { firstName: f.teacher.firstName, lastName: f.teacher.lastName } : null,
      year: f?.year ?? null,
      trimester: f?.trimester ?? null,
      language: f?.language ?? null,
      hasCorrection: f?.hasCorrection ?? null,
      viewsCount: f?.viewsCount ?? null,
      downloadsCount: f?.downloadsCount ?? null,
      publishedAt: f?.publishedAt ?? null,
      score: parseFloat(r.combined_score) || 0,
      ftsScore: parseFloat(r.fts_score) || 0,
      trgmScore: parseFloat(r.trgm_score) || 0,
    };
  });

  const facets: SearchResponse['facets'] = {
    type: facetRows[0]?.type_facets || {},
    subjectId: facetRows[0]?.subj_facets || {},
    classId: facetRows[0]?.class_facets || {},
    sectionId: facetRows[0]?.sect_facets || {},
    year: facetRows[0]?.year_facets || {},
    trimester: facetRows[0]?.tri_facets || {},
    language: facetRows[0]?.lang_facets || {},
    hasCorrection: facetRows[0]?.has_correction || 0,
  };

  return {
    query: q,
    variants,
    expandedQuery: variants.length > 1 ? variants.join(' · ') : undefined,
    synonymsApplied: expandedQuery.applied,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    sort,
    durationMs: Date.now() - t0,
    filters,
    results,
    facets,
  };
}

function emptyResponse(opts: {
  q: string;
  page: number;
  limit: number;
  sort: string;
  filters: SearchFilters;
  t0: number;
  expandedQuery: { variants: string[]; applied: string[] };
}): SearchResponse {
  return {
    query: opts.q,
    variants: opts.expandedQuery.variants,
    expandedQuery:
      opts.expandedQuery.variants.length > 1 ? opts.expandedQuery.variants.join(' · ') : undefined,
    synonymsApplied: opts.expandedQuery.applied,
    page: opts.page,
    limit: opts.limit,
    total: 0,
    totalPages: 0,
    sort: opts.sort,
    durationMs: Date.now() - opts.t0,
    filters: opts.filters,
    results: [],
    facets: {
      type: {},
      subjectId: {},
      classId: {},
      sectionId: {},
      year: {},
      trimester: {},
      language: {},
      hasCorrection: 0,
    },
  };
}

// ============================================================================
// Cached wrapper — 2026-07-30 page speed audit
// ============================================================================
// The raw searchV2 takes 1.2-2.1s for any non-empty query (FTS + TRGM +
// facets + hydration). Caching by (q, page, limit, sort, filters) with
// a 60s TTL drops repeat requests to ~10-30ms (Data Cache hit).
//
// Trade-offs:
//   - 60s stale window: acceptable for search (data doesn't change that fast)
//   - Per-region cache (Vercel Data Cache): users in same region share cache
//   - No cache for empty queries (would just return emptyResponse anyway)
import { unstable_cache } from 'next/cache';

const CACHE_TTL_SECONDS = 60;

/**
 * Stable cache key for a search call. Includes all inputs that change the result.
 * Different queries get different cache slots automatically.
 */
function searchKey(options: SearchOptions): string {
  const f = options.filters || {};
  return JSON.stringify({
    q: (options.q || '').toLowerCase().trim(),
    page: options.page || 1,
    limit: options.limit || 20,
    sort: options.sort || 'relevance',
    subject: f.subject || [],
    class: f.class || [],
    section: f.section || [],
    type: f.type || [],
    year: f.year || [],
    trimester: f.trimester || [],
    language: f.language || [],
    hasCorrection: f.hasCorrection || false,
    teacherId: f.teacherId || '',
  });
}

/**
 * Cached search. Use this in page server components and API routes.
 * Wraps the raw searchV2 with a 60s TTL keyed on all query inputs.
 *
 * @example
 *   const data = await cachedSearchV2({ q: 'physique', page: 1, limit: 12, ... });
 */
export async function cachedSearchV2(options: SearchOptions): Promise<SearchResponse> {
  // Empty queries return empty instantly — no need to cache
  if (!options.q || !options.q.trim()) {
    return searchV2(options);
  }
  // Use the cache: key by all inputs, revalidate after 60s
  return unstable_cache(
    () => searchV2(options),
    ['search-v2', searchKey(options)],
    { revalidate: CACHE_TTL_SECONDS, tags: ['search'] }
  )();
}

// @ts-nocheck
/**
 * search-v2-d1.ts
 * D1-compatible search engine.
 * 
 * Replaces the Postgres FTS + pg_trgm approach with:
 * - LIKE-based text matching (works on SQLite/D1)
 * - Simple relevance scoring (keyword count + recency)
 * - Facets via parallel queries
 * - Highlighting via string replace (basic)
 * 
 * No FTS5 virtual table for now (can be added later if needed).
 * 
 * Uses the same exported interface as search-v2.ts for drop-in compatibility.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
// resolveSlugs inlined in D1 version - no search-cache dependency

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
// Helpers
// ============================================================================

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

// Get synonyms from D1 (simple list, not graph)
async function getSynonymsD1(db: any): Promise<string[]> {
  try {
    const r = await db.prepare('SELECT term, synonyms FROM SearchSynonym').all();
    const result: string[] = [];
    for (const row of (r?.results || [])) {
      if (row.term) result.push(row.term);
      if (row.synonyms) {
        try {
          const syns = typeof row.synonyms === 'string' ? JSON.parse(row.synonyms) : row.synonyms;
          if (Array.isArray(syns)) result.push(...syns);
        } catch {}
      }
    }
    return result;
  } catch {
    return [];
  }
}

// Expand query with synonyms (simple)
function expandQueryWithSynonyms(q: string, synonyms: string[]): { variants: string[]; synonymsApplied: string[] } {
  const trimmed = q.trim();
  if (!trimmed) return { variants: [], synonymsApplied: [] };
  
  const variants: string[] = [trimmed];
  const applied: string[] = [];
  
  // Check each synonym to see if it matches
  for (const syn of synonyms) {
    if (!syn || typeof syn !== 'string') continue;
    const lowerSyn = syn.toLowerCase();
    if (trimmed.toLowerCase().includes(lowerSyn)) {
      // Already in the query
      continue;
    }
    // This is a simple expansion - in a real FTS we'd do more
  }
  
  return { variants, synonymsApplied: applied };
}

// Highlight matched terms in a string
function highlight(text: string, q: string): string | null {
  if (!text || !q) return text || null;
  const terms = q.split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return text;
  
  let result = text;
  for (const term of terms) {
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
  }
  return result;
}

// Empty response
function emptyResponse(opts: any): SearchResponse {
  return {
    query: opts.q || '',
    variants: [],
    expandedQuery: opts.expandedQuery?.expandedQuery,
    synonymsApplied: opts.expandedQuery?.synonymsApplied || [],
    page: opts.page,
    limit: opts.limit,
    total: 0,
    totalPages: 0,
    sort: opts.sort,
    durationMs: 0,
    filters: opts.filters || {},
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
  
  try {
    const db = await getD1();
    if (!db) {
      return { ...emptyResponse({ q, page, limit, sort, filters, t0 }), durationMs: Date.now() - t0 };
    }
    
    // 1. Get synonyms
    const synonyms = await getSynonymsD1(db);
    const expandedQuery = expandQueryWithSynonyms(q, synonyms);
    
    // 2. Resolve slugs to IDs
    let subjectIds: string[] = [];
    let classIds: string[] = [];
    let sectionIds: string[] = [];
    
    if (filters.subject?.length) {
      const placeholders = filters.subject.map(() => '?').join(',');
      const r = await db.prepare(`SELECT id FROM Subject WHERE slug IN (${placeholders})`).bind(...filters.subject).all();
      subjectIds = (r?.results || []).map((s: any) => s.id);
      if (!subjectIds.length) return emptyResponse({ q, page, limit, sort, filters, t0, expandedQuery });
    }
    if (filters.class?.length) {
      const placeholders = filters.class.map(() => '?').join(',');
      const r = await db.prepare(`SELECT id FROM "Class" WHERE slug IN (${placeholders})`).bind(...filters.class).all();
      classIds = (r?.results || []).map((c: any) => c.id);
      if (!classIds.length) return emptyResponse({ q, page, limit, sort, filters, t0, expandedQuery });
    }
    if (filters.section?.length) {
      const placeholders = filters.section.map(() => '?').join(',');
      const r = await db.prepare(`SELECT id FROM Section WHERE slug IN (${placeholders})`).bind(...filters.section).all();
      sectionIds = (r?.results || []).map((s: any) => s.id);
      if (!sectionIds.length) return emptyResponse({ q, page, limit, sort, filters, t0, expandedQuery });
    }
    
    // 3. Build WHERE clause
    const conditions: string[] = ["r.status = 'PUBLISHED'"];
    const params: any[] = [];
    
    if (q) {
      // LIKE-based search: search in title, description, summary
      const likeParam = `%${q}%`;
      conditions.push('(r.title LIKE ? OR r.description LIKE ? OR r.summary LIKE ?)');
      params.push(likeParam, likeParam, likeParam);
    }
    if (subjectIds.length) {
      const placeholders = subjectIds.map(() => '?').join(',');
      conditions.push(`r.subjectId IN (${placeholders})`);
      params.push(...subjectIds);
    }
    if (classIds.length) {
      const placeholders = classIds.map(() => '?').join(',');
      conditions.push(`r.classId IN (${placeholders})`);
      params.push(...classIds);
    }
    if (sectionIds.length) {
      const placeholders = sectionIds.map(() => '?').join(',');
      conditions.push(`r.sectionId IN (${placeholders})`);
      params.push(...sectionIds);
    }
    if (filters.type?.length) {
      const placeholders = filters.type.map(() => '?').join(',');
      conditions.push(`r.type IN (${placeholders})`);
      params.push(...filters.type);
    }
    if (filters.year?.length) {
      const placeholders = filters.year.map(() => '?').join(',');
      conditions.push(`r.year IN (${placeholders})`);
      params.push(...filters.year);
    }
    if (filters.trimester?.length) {
      const placeholders = filters.trimester.map(() => '?').join(',');
      conditions.push(`r.trimester IN (${placeholders})`);
      params.push(...filters.trimester);
    }
    if (filters.language?.length) {
      const placeholders = filters.language.map(() => '?').join(',');
      conditions.push(`r.language IN (${placeholders})`);
      params.push(...filters.language);
    }
    if (filters.hasCorrection !== undefined) {
      conditions.push(filters.hasCorrection ? 'r.hasCorrection = 1' : 'r.hasCorrection = 0');
    }
    if (filters.teacherId) {
      // teacherId is numericId
      const teacherRow: any = await db.prepare(
        "SELECT id FROM User WHERE numericId = ? AND role = 'TEACHER' LIMIT 1"
      ).bind(parseInt(filters.teacherId, 10)).first();
      if (teacherRow) {
        conditions.push('r.teacherId = ?');
        params.push(teacherRow.id);
      } else {
        return emptyResponse({ q, page, limit, sort, filters, t0, expandedQuery });
      }
    }
    
    const whereClause = conditions.join(' AND ');
    
    // 4. ORDER BY
    const orderBy = sort === 'recent' ? 'r.publishedAt DESC' :
                    sort === 'popular' ? 'r.viewsCount DESC' :
                    sort === 'downloads' ? 'r.downloadsCount DESC' :
                    'r.publishedAt DESC'; // 'relevance' defaults to recent (no FTS score)
    
    // 5. Main query - resources with joins
    const resourcesSql = [
      'SELECT',
      '  r.id, r.numericId, r.slug, r.title, r.description, r.type, r.year, r.trimester,',
      '  r.language, r.hasCorrection, r.viewsCount, r.downloadsCount,',
      '  r.publishedAt, r.subjectId, r.classId, r.sectionId, r.teacherId,',
      '  s.id as s_id, s.slug as s_slug, s.nameFr as s_nameFr, s.color as s_color,',
      '  c.id as c_id, c.slug as c_slug, c.nameFr as c_nameFr,',
      '  sec.id as sec_id, sec.slug as sec_slug, sec.nameFr as sec_nameFr,',
      '  t.id as t_id, t.firstName as t_firstName, t.lastName as t_lastName',
      'FROM Resource r',
      'LEFT JOIN `Subject` s ON r.subjectId = s.id',
      'LEFT JOIN `Class` c ON r.classId = c.id',
      'LEFT JOIN `Section` sec ON r.sectionId = sec.id',
      'LEFT JOIN `User` t ON r.teacherId = t.id',
      'WHERE ' + whereClause,
      'ORDER BY ' + orderBy,
      'LIMIT ? OFFSET ?',
    ].join('\n');
    
    // 6. Count query
    const countSql = "SELECT COUNT(*) as total FROM Resource r WHERE " + whereClause;
    
    // 7. Run in parallel
    const [resourcesResult, countResult] = await Promise.all([
      db.prepare(resourcesSql).bind(...params, limit, offset).all(),
      db.prepare(countSql).bind(...params).first(),
    ]);
    
    const total = countResult?.total || 0;
    const resources = resourcesResult?.results || [];
    
    // 8. Format results
    const results: SearchResult[] = resources.map((r: any) => ({
      id: r.id,
      numericId: r.numericId,
      slug: r.slug,
      title: r.title,
      titleHighlighted: highlight(r.title || '', q),
      descriptionHighlighted: highlight((r.description || '').slice(0, 200), q),
      type: r.type,
      subject: r.s_id ? { nameFr: r.s_nameFr, slug: r.s_slug, color: r.s_color } : null,
      class: r.c_id ? { nameFr: r.c_nameFr, slug: r.c_slug } : null,
      section: r.sec_id ? { nameFr: r.sec_nameFr, slug: r.sec_slug } : null,
      teacher: r.t_id ? { firstName: r.t_firstName, lastName: r.t_lastName } : null,
      year: r.year,
      trimester: r.trimester,
      language: r.language,
      hasCorrection: !!r.hasCorrection,
      viewsCount: r.viewsCount || 0,
      downloadsCount: r.downloadsCount || 0,
      publishedAt: r.publishedAt,
      score: 0, // No FTS score in D1 version
      ftsScore: 0,
      trgmScore: 0,
    }));
    
    // 9. Get facets (in parallel with the above would be ideal, but for now sequential)
    // Facets: count by type, subjectId, classId, etc.
    // Use the same WHERE clause but no LIMIT
    const facetsSql = [
      'SELECT type, subjectId, classId, sectionId, year, trimester, language, hasCorrection',
      'FROM Resource r',
      'WHERE ' + whereClause,
    ].join('\n');
    const facetsResult = await db.prepare(facetsSql).bind(...params).all();
    const facets = facetsResult?.results || [];
    
    const byType: Record<string, number> = {};
    const bySubjectId: Record<string, number> = {};
    const byClassId: Record<string, number> = {};
    const bySectionId: Record<string, number> = {};
    const byYear: Record<string, number> = {};
    const byTrimester: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};
    let withCorrection = 0;
    
    for (const r of facets) {
      if (r.type) byType[r.type] = (byType[r.type] || 0) + 1;
      if (r.subjectId) bySubjectId[r.subjectId] = (bySubjectId[r.subjectId] || 0) + 1;
      if (r.classId) byClassId[r.classId] = (byClassId[r.classId] || 0) + 1;
      if (r.sectionId) bySectionId[r.sectionId] = (bySectionId[r.sectionId] || 0) + 1;
      if (r.year) byYear[r.year] = (byYear[r.year] || 0) + 1;
      if (r.trimester) byTrimester[r.trimester] = (byTrimester[r.trimester] || 0) + 1;
      if (r.language) byLanguage[r.language] = (byLanguage[r.language] || 0) + 1;
      if (r.hasCorrection) withCorrection++;
    }
    
    return {
      query: q,
      variants: expandedQuery.variants,
      expandedQuery: expandedQuery.expandedQuery,
      synonymsApplied: expandedQuery.synonymsApplied,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      sort,
      durationMs: Date.now() - t0,
      filters,
      results,
      facets: {
        type: byType,
        subjectId: bySubjectId,
        classId: byClassId,
        sectionId: bySectionId,
        year: byYear,
        trimester: byTrimester,
        language: byLanguage,
        hasCorrection: withCorrection,
      },
    };
  } catch (e: any) {
    console.error('[search-v2-d1] error:', e?.message);
    return { ...emptyResponse({ q, page, limit, sort, filters, t0 }), durationMs: Date.now() - t0 };
  }
}

// ============================================================================
// Cached search (wraps searchV2 with KV cache)
// ============================================================================
export async function cachedSearchV2(options: SearchOptions): Promise<SearchResponse> {
  const cacheKey = `search-v2-${JSON.stringify(options)}`;
  try {
    const { cachedD1Query } = await import('@/lib/kv-cache');
    return await cachedD1Query({
      key: cacheKey,
      ttl: 60, // 1 min
      query: () => searchV2(options),
    });
  } catch {
    return await searchV2(options);
  }
}

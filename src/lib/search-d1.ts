// @ts-nocheck
/**
 * search-d1.ts
 * D1 (SQLite) + FTS5 search engine for Cloudflare Workers
 *
 * Replaces search-v2.ts (Postgres tsvector + pg_trgm) on CF Workers
 * while keeping identical public API so callers don't need to change.
 *
 * Strategy:
 *   1. Detect language (FR vs AR) from query characters
 *   2. Use resource_fts (FR/Latin) or resource_fts_trigram (AR/CJK) accordingly
 *   3. Fall back to LIKE for ambiguous queries
 *   4. bm25() for ranking
 *   5. Combine with subject/class filters via JOIN
 *
 * Quality trade-offs vs Postgres tsvector:
 *   - FTS5 has no language-specific stemmer (FR/AR)
 *   - AR quality decreases (FTS5 doesn't tokenize Arabic properly)
 *   - bm25() is roughly equivalent to ts_rank for top-K results
 *
 * Schema:
 *   - resource_fts: FTS5 virtual table, content='Resource', content_rowid='numericId'
 *   - resource_fts_trigram: same but with trigram tokenizer
 */

import { getD1Db } from './db/d1-client';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql, eq, and, or, like, desc, asc, inArray } from 'drizzle-orm';

// ============================================================================
// Types (same as search-v2.ts for compatibility)
// ============================================================================

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
  viewsCount: number;
  downloadsCount: number;
  avgRating: number | null;
  rank: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  took: number;
  suggestions?: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Detect if query is primarily Arabic.
 * If >30% of characters are in Arabic Unicode block, treat as AR.
 */
function isArabicQuery(q: string): boolean {
  if (!q) return false;
  const arabicChars = (q.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (q.match(/[a-zA-Z]/g) || []).length;
  return arabicChars > 0 && arabicChars > latinChars * 0.3;
}

/**
 * Sanitize query for FTS5 MATCH.
 * - Strip non-word/non-space chars
 * - Add prefix-match for last term (e.g., "math*" matches "mathématiques")
 * - Wrap in double quotes to handle special FTS5 chars
 */
function buildFts5Query(raw: string): string {
  const trimmed = raw.trim().slice(0, 200);
  if (!trimmed) return '';

  // Split into tokens, escape FTS5 special chars
  const tokens = trimmed
    .replace(/[^\w\s\u0600-\u06FF\-àâäéèêëïîôöùûüÿçñ]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/"/g, '""')); // escape double quotes

  if (tokens.length === 0) return '';

  // Add prefix-match to last token for partial matches
  const lastToken = tokens.pop();
  const prefixQuery = `"${lastToken}"*`;
  const otherTokens = tokens.map((t) => `"${t}"`).join(' ');

  return otherTokens ? `${otherTokens} ${prefixQuery}` : prefixQuery;
}

/**
 * Escape query for LIKE.
 */
function buildLikeQuery(raw: string): string {
  return raw
    .trim()
    .slice(0, 200)
    .replace(/[\\%_]/g, '\\$&');
}

// ============================================================================
// Main search function
// ============================================================================

export async function searchResourcesD1(options: SearchOptions): Promise<SearchResponse> {
  const start = Date.now();
  const {
    q = '',
    filters = {},
    page = 1,
    limit = 12,
    sort = 'relevance',
  } = options;

  const trimmed = q.trim();
  const offset = (page - 1) * limit;

  if (!trimmed) {
    // No search query - return filtered list ordered by recency
    return await listResourcesD1(filters, page, limit, sort, start);
  }

  // Build FTS5 query
  const ftsQuery = buildFts5Query(trimmed);
  if (!ftsQuery) {
    return emptyResponse(page, limit, start);
  }

  const isAr = isArabicQuery(trimmed);
  const ftsTable = isAr ? 'resource_fts_trigram' : 'resource_fts';

  // Get D1 client
  const db = await getD1Db();

  // Build WHERE conditions
  const conditions = [
    sql`r.status = 'PUBLISHED'`,
    sql`r.${sql.raw(ftsTable === 'resource_fts_trigram' ? 'numericId' : 'numericId')} IN (
      SELECT rowid FROM ${sql.raw(ftsTable)} WHERE ${sql.raw(ftsTable)} MATCH ${ftsQuery}
    )`,
  ];

  if (filters.subject?.length) {
    conditions.push(inArray(sql`r.subjectId`, filters.subject));
  }
  if (filters.class?.length) {
    conditions.push(inArray(sql`r.classId`, filters.class));
  }
  if (filters.section?.length) {
    conditions.push(inArray(sql`r.sectionId`, filters.section));
  }
  if (filters.type?.length) {
    conditions.push(inArray(sql`r.type`, filters.type));
  }
  if (filters.year?.length) {
    conditions.push(inArray(sql`r.year`, filters.year));
  }
  if (filters.teacherId) {
    conditions.push(eq(sql`r.teacherId`, filters.teacherId));
  }
  if (filters.hasCorrection !== undefined) {
    conditions.push(eq(sql`r.hasCorrection`, filters.hasCorrection ? 1 : 0));
  }

  // Order by
  let orderBy;
  if (sort === 'recent') {
    orderBy = desc(sql`r.publishedAt`);
  } else if (sort === 'popular') {
    orderBy = desc(sql`r.viewsCount`);
  } else if (sort === 'downloads') {
    orderBy = desc(sql`r.downloadsCount`);
  } else {
    // relevance: use bm25() from FTS5
    orderBy = sql`bm25(${sql.raw(ftsTable)})`;
  }

  // Run query
  try {
    // Get total count
    const countResult = await db.all<{ total: number }>(sql`
      SELECT COUNT(*) as total
      FROM Resource r
      WHERE ${sql.join(conditions, sql` AND `)}
    `);
    const total = Number(countResult[0]?.total || 0);

    // Get results
    const rows = await db.all<any>(sql`
      SELECT
        r.id, r.numericId, r.slug, r.title, r.description, r.type,
        r.subjectId, r.classId, r.sectionId, r.teacherId, r.year, r.trimester,
        r.viewsCount, r.downloadsCount, r.avgRating, r.publishedAt,
        s.nameFr as subjectName, s.slug as subjectSlug, s.color as subjectColor,
        c.nameFr as className, c.slug as classSlug,
        sec.nameFr as sectionName, sec.slug as sectionSlug,
        u.firstName as teacherFirst, u.lastName as teacherLast,
        bm25(${sql.raw(ftsTable)}) as rank
      FROM Resource r
      INNER JOIN ${sql.raw(ftsTable)} ON r.numericId = ${sql.raw(ftsTable)}.rowid
      LEFT JOIN Subject s ON r.subjectId = s.id
      LEFT JOIN Class c ON r.classId = c.id
      LEFT JOIN Section sec ON r.sectionId = sec.id
      LEFT JOIN User u ON r.teacherId = u.id
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `);

    const results: SearchResult[] = rows.map((row) => ({
      id: row.id,
      numericId: row.numericId,
      slug: row.slug,
      title: row.title,
      titleHighlighted: highlightTitle(row.title, trimmed),
      descriptionHighlighted: highlightTitle(row.description, trimmed),
      type: row.type,
      subject: row.subjectName
        ? { nameFr: row.subjectName, slug: row.subjectSlug, color: row.subjectColor }
        : null,
      class: row.className ? { nameFr: row.className, slug: row.classSlug } : null,
      section: row.sectionName ? { nameFr: row.sectionName, slug: row.sectionSlug } : null,
      teacher:
        row.teacherFirst || row.teacherLast
          ? { firstName: row.teacherFirst, lastName: row.teacherLast }
          : null,
      year: row.year,
      trimester: row.trimester,
      viewsCount: Number(row.viewsCount || 0),
      downloadsCount: Number(row.downloadsCount || 0),
      avgRating: row.avgRating ? Number(row.avgRating) : null,
      rank: Number(row.rank || 0),
    }));

    return {
      results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      took: Date.now() - start,
    };
  } catch (e: any) {
    console.error('[search-d1] FTS5 error:', e?.message);
    // Fallback to LIKE search
    return await searchResourcesLike(trimmed, filters, page, limit, sort, start);
  }
}

/**
 * Fallback search using LIKE (slower but always works)
 */
async function searchResourcesLike(
  q: string,
  filters: SearchFilters,
  page: number,
  limit: number,
  sort: string,
  start: number,
): Promise<SearchResponse> {
  const db = await getD1Db();
  const likeQuery = `%${buildLikeQuery(q)}%`;

  const conditions = [
    sql`r.status = 'PUBLISHED'`,
    or(
      like(sql`r.title`, likeQuery),
      like(sql`r.description`, likeQuery),
      like(sql`r.tags`, likeQuery),
    )!,
  ];

  if (filters.subject?.length) {
    conditions.push(inArray(sql`r.subjectId`, filters.subject));
  }
  if (filters.class?.length) {
    conditions.push(inArray(sql`r.classId`, filters.class));
  }
  if (filters.teacherId) {
    conditions.push(eq(sql`r.teacherId`, filters.teacherId));
  }

  const orderBy =
    sort === 'recent'
      ? desc(sql`r.publishedAt`)
      : sort === 'popular'
        ? desc(sql`r.viewsCount`)
        : sort === 'downloads'
          ? desc(sql`r.downloadsCount`)
          : desc(sql`r.publishedAt`);

  const countResult = await db.all<{ total: number }>(sql`
    SELECT COUNT(*) as total
    FROM Resource r
    WHERE ${sql.join(conditions, sql` AND `)}
  `);
  const total = Number(countResult[0]?.total || 0);

  const offset = (page - 1) * limit;
  const rows = await db.all<any>(sql`
    SELECT
      r.id, r.numericId, r.slug, r.title, r.description, r.type,
      r.subjectId, r.classId, r.teacherId, r.year, r.trimester,
      r.viewsCount, r.downloadsCount, r.avgRating
    FROM Resource r
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);

  return {
    results: rows.map((r) => ({
      id: r.id,
      numericId: r.numericId,
      slug: r.slug,
      title: r.title,
      titleHighlighted: highlightTitle(r.title, q),
      descriptionHighlighted: highlightTitle(r.description, q),
      type: r.type,
      subject: null,
      class: null,
      section: null,
      teacher: null,
      year: r.year,
      trimester: r.trimester,
      viewsCount: Number(r.viewsCount || 0),
      downloadsCount: Number(r.downloadsCount || 0),
      avgRating: r.avgRating ? Number(r.avgRating) : null,
      rank: 0,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    took: Date.now() - start,
  };
}

/**
 * List resources without search query (just filters)
 */
async function listResourcesD1(
  filters: SearchFilters,
  page: number,
  limit: number,
  sort: string,
  start: number,
): Promise<SearchResponse> {
  const db = await getD1Db();
  const conditions = [sql`r.status = 'PUBLISHED'`];

  if (filters.subject?.length) {
    conditions.push(inArray(sql`r.subjectId`, filters.subject));
  }
  if (filters.class?.length) {
    conditions.push(inArray(sql`r.classId`, filters.class));
  }
  if (filters.teacherId) {
    conditions.push(eq(sql`r.teacherId`, filters.teacherId));
  }

  const orderBy =
    sort === 'recent'
      ? desc(sql`r.publishedAt`)
      : sort === 'popular'
        ? desc(sql`r.viewsCount`)
        : sort === 'downloads'
          ? desc(sql`r.downloadsCount`)
          : desc(sql`r.publishedAt`);

  const countResult = await db.all<{ total: number }>(sql`
    SELECT COUNT(*) as total
    FROM Resource r
    WHERE ${sql.join(conditions, sql` AND `)}
  `);
  const total = Number(countResult[0]?.total || 0);

  const offset = (page - 1) * limit;
  const rows = await db.all<any>(sql`
    SELECT
      r.id, r.numericId, r.slug, r.title, r.description, r.type,
      r.year, r.trimester, r.viewsCount, r.downloadsCount, r.avgRating
    FROM Resource r
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);

  return {
    results: rows.map((r) => ({
      id: r.id,
      numericId: r.numericId,
      slug: r.slug,
      title: r.title,
      titleHighlighted: null,
      descriptionHighlighted: null,
      type: r.type,
      subject: null,
      class: null,
      section: null,
      teacher: null,
      year: r.year,
      trimester: r.trimester,
      viewsCount: Number(r.viewsCount || 0),
      downloadsCount: Number(r.downloadsCount || 0),
      avgRating: r.avgRating ? Number(r.avgRating) : null,
      rank: 0,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    took: Date.now() - start,
  };
}

function emptyResponse(page: number, limit: number, start: number): SearchResponse {
  return {
    results: [],
    total: 0,
    page,
    limit,
    totalPages: 0,
    took: Date.now() - start,
  };
}

/**
 * Simple <mark> highlighting (FTS5 has snippet() but more complex)
 */
function highlightTitle(text: string | null, query: string): string | null {
  if (!text || !query) return text;
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  let result = text;
  for (const token of tokens) {
    const safeToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`(${safeToken})`, 'gi'), '<mark>$1</mark>');
  }
  return result;
}

// ============================================================================
// Suggest (autocomplete) — same FTS5 strategy
// ============================================================================

export async function suggestD1(q: string, limit: number = 8): Promise<any[]> {
  if (!q || q.length < 2) return [];

  const ftsQuery = buildFts5Query(q);
  if (!ftsQuery) return [];

  const isAr = isArabicQuery(q);
  const ftsTable = isAr ? 'resource_fts_trigram' : 'resource_fts';

  const db = await getD1Db();

  try {
    const rows = await db.all<any>(sql`
      SELECT
        r.id, r.title, r.slug, r.type,
        s.nameFr as subjectName,
        bm25(${sql.raw(ftsTable)}) as rank
      FROM Resource r
      INNER JOIN ${sql.raw(ftsTable)} ON r.numericId = ${sql.raw(ftsTable)}.rowid
      LEFT JOIN Subject s ON r.subjectId = s.id
      WHERE r.status = 'PUBLISHED'
      ORDER BY bm25(${sql.raw(ftsTable)})
      LIMIT ${limit}
    `);

    return rows.map((r) => ({
      type: 'resource',
      id: r.id,
      title: r.title,
      subtitle: r.subjectName,
      href: `/fr/ressources/${r.numericId || r.id}/${r.slug}`,
      icon: r.type,
    }));
  } catch (e: any) {
    console.error('[suggest-d1] FTS5 error:', e?.message);
    // Fallback to LIKE
    const likeQuery = `%${buildLikeQuery(q)}%`;
    const rows = await db.all<any>(sql`
      SELECT r.id, r.title, r.slug, r.type, s.nameFr as subjectName
      FROM Resource r
      LEFT JOIN Subject s ON r.subjectId = s.id
      WHERE r.status = 'PUBLISHED'
        AND (r.title LIKE ${likeQuery} OR r.description LIKE ${likeQuery})
      ORDER BY r.viewsCount DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      type: 'resource',
      id: r.id,
      title: r.title,
      subtitle: r.subjectName,
      href: `/fr/ressources/${r.numericId || r.id}/${r.slug}`,
      icon: r.type,
    }));
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { rateLimitKv, rateLimitResponse } from '@/lib/rate-limit-kv';
import { logSearchRequest } from '@/lib/search-logger';
import { getClientIp } from '@/lib/security';

export const runtime = 'nodejs';
export const revalidate = 60; // 5 min cache

const SUGGEST_TYPES = ['resource', 'teacher', 'subject', 'class', 'section'] as const;
type SuggestType = (typeof SUGGEST_TYPES)[number];

interface SuggestResult {
  type: SuggestType;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: string;
}

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

async function searchResources(db: any, q: string, limit: number): Promise<SuggestResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  // 2026-11-13: D1 refuses LIKE patterns over 48 BYTES ("pattern too complex"),
  // so a ~24-char Arabic query threw and killed suggest. instr() = same match.
  // 2026-09-05: also filter isHidden=0 to hide unpublished resources
  // (DO NOT put JS-style // comments inside the SQL template literal — SQLite doesn't understand them)
  // 2026-11-18: FORCE the viewsCount index (resource_views_idx).
  // instr(lower(...)) is not indexable, so the planner used to scan ALL
  // 15 422 rows AND sort them: 88-205 ms of D1 CPU PER KEYSTROKE (measured
  // on the live DB). That burned the account's 10-second CPU budget, and once
  // it was blown EVERY D1 query of the whole DB started failing with
  // "D1 DB is overloaded" (2026-11-16 + 2026-11-17 => 105 + 85 HTTP 500 on
  // /fr/recherche, /api/search/suggest, /api/ressources/*/detail, ...).
  // Walking resource_views_idx in viewsCount DESC order lets SQLite stop as
  // soon as `limit` rows matched: SAME rows, SAME order, 0.4-2.4 ms (87-342x
  // faster, verified row-by-row against the live DB on 2026-11-18).
  const buildSql = (indexed: boolean) =>
    [
      'SELECT r.id, r.numericId, r.title, r.slug, r.type,',
      '       s.nameFr as subjectName, c.nameFr as className',
      'FROM Resource r' + (indexed ? ' INDEXED BY resource_views_idx' : ''),
      'LEFT JOIN `Subject` s ON r.subjectId = s.id',
      'LEFT JOIN `Class` c ON r.classId = c.id',
      "WHERE r.status = 'PUBLISHED' AND r.isHidden = 0",
      '  AND (instr(lower(r.title), lower(?)) > 0 OR instr(lower(r.description), lower(?)) > 0 OR instr(lower(r.summary), lower(?)) > 0)',
      'ORDER BY r.viewsCount DESC',
      'LIMIT ?',
    ].join(' ');

  let r: any;
  try {
    r = await db.prepare(buildSql(true)).bind(trimmed, trimmed, trimmed, limit).all();
  } catch (e: any) {
    // If a future migration drops resource_views_idx, fall back to the plain
    // query instead of 500-ing the whole autocomplete.
    if (!/no such index/i.test(e?.message || '')) throw e;
    r = await db.prepare(buildSql(false)).bind(trimmed, trimmed, trimmed, limit).all();
  }

  return (r?.results || []).map((row: any) => ({
    type: 'resource' as SuggestType,
    id: row.id,
    numericId: row.numericId,
    title: row.title,
    subtitle: [row.subjectName, row.className].filter(Boolean).join(' • '),
    href: `/fr/ressources/${row.numericId || row.id}/${row.slug}`,
    icon: 'file-text',
  }));
}

async function searchTeachers(db: any, q: string, limit: number): Promise<SuggestResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  // 2026-11-13: D1 refuses LIKE patterns over 48 BYTES ("pattern too complex"),
  // so a ~24-char Arabic query threw and killed suggest. instr() = same match.
  const r = await db.prepare(`
    SELECT id, numericId, slug, firstName, lastName, schoolName
    FROM User
    WHERE role = 'TEACHER' AND status = 'ACTIVE'
      AND (instr(lower(firstName), lower(?)) > 0 OR instr(lower(lastName), lower(?)) > 0 OR instr(lower(IFNULL(schoolName, '')), lower(?)) > 0)
    LIMIT ?
  `).bind(trimmed, trimmed, trimmed, limit).all();
  
  return (r?.results || []).map((row: any) => ({
    type: 'teacher' as SuggestType,
    id: row.id,
    numericId: row.numericId,
    title: `${row.firstName} ${row.lastName}`,
    subtitle: row.schoolName || 'Enseignant',
    href: `/fr/professeurs/${row.numericId || row.id}`,
    icon: 'user',
  }));
}

async function searchSubjects(db: any, q: string, limit: number): Promise<SuggestResult[]> {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return [];
  
  // 2026-11-13: D1 refuses LIKE patterns over 48 BYTES ("pattern too complex"),
  // so a ~24-char Arabic query threw and killed suggest. instr() = same match.
  const r = await db.prepare(`
    SELECT id, slug, nameFr, nameAr
    FROM Subject
    WHERE instr(lower(nameFr), lower(?)) > 0 OR instr(lower(nameAr), lower(?)) > 0
    ORDER BY nameFr ASC
    LIMIT ?
  `).bind(trimmed, trimmed, limit).all();
  
  return (r?.results || []).map((row: any) => ({
    type: 'subject' as SuggestType,
    id: row.id,
    title: row.nameFr,
    href: `/fr/matieres/${row.slug}`,
    icon: 'book',
  }));
}

export async function GET(req: NextRequest) {
  // 2026-09-07: Rate limit per IP — 60 req/min (suggest is autocomplete, higher threshold)
  const rl = await rateLimitKv(req, 'search-suggest', 60, 60 * 1000);
  if (!rl.allowed) {
    logSearchRequest({
      endpoint: 'search-suggest',
      request: req,
      query: req.nextUrl.searchParams.get('q') || '',
      status: 429,
      durationMs: 0,
    }).catch(() => {});
    return rateLimitResponse(rl);
  }

  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }
    
    const db = await getD1();
    if (!db) {
      return NextResponse.json({ results: [], error: 'DB not available' }, { status: 503 });
    }
    
    const [resources, teachers, subjects] = await Promise.all([
      searchResources(db, q, 5),
      searchTeachers(db, q, 3),
      searchSubjects(db, q, 3),
    ]);
    
    return NextResponse.json({
      results: [...resources, ...teachers, ...subjects],
    });
  } catch (e: any) {
    console.error('[search/suggest] error:', e?.message);
    logSearchRequest({
      endpoint: 'search-suggest',
      request: req,
      query: req.nextUrl.searchParams.get('q') || '',
      status: 500,
      durationMs: 0,
    }).catch(() => {});
    return NextResponse.json({ results: [], error: e?.message }, { status: 500 });
  }
}

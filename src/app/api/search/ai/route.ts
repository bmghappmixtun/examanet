// @ts-nocheck
/**
 * /api/search/ai — Worker proxy for Cloudflare AI Search
 *
 * 2026-10-08: Reconstructed from session 409889696682287 (23/9/2026
 * architecture diagram) + Cloudflare AI Search instance
 * `examanet-text-search-v2` (14k items indexed, 1024-dim, R2 source
 * `examanet-text-prod`).
 *
 * Architecture (3 layers, no LLM in the loop):
 *   1. USER  (frontend /recherche-ai or /api/search/ai)
 *   2. WORKER PROXY  (this route — thin pass-through)
 *        - validate query
 *        - forward to CF AI Search
 *        - parse .txt header for metadata
 *        - lookup D1 Resource → PDF URL
 *   3. CF AI SEARCH  (managed RAG, @cf/qwen/qwen3-embedding-0.6b)
 *
 * Auth: requires CF_API_TOKEN (Worker AI:Read + AI Search:Read).
 *       Token is fetched via getSecret(), never hardcoded.
 *
 * Rate limit: 30 req/min/IP (same as /api/search/v2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { rateLimitKv, rateLimitResponse } from '@/lib/rate-limit-kv';
import { getClientIp } from '@/lib/security';
import { getSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCOUNT_ID_DEFAULT = '59cffdeaadf3809cc3d2039c43f836e0';
const AI_SEARCH_INSTANCE_DEFAULT = 'examanet-text-search-v2';
const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 8;

interface AiSearchHit {
  file_id?: string;
  filename?: string;
  content?: string;
  score?: number;
  metadata?: Record<string, string>;
}

interface AiSearchResponse {
  success: boolean;
  result?: {
    response?: string;
    sources?: Array<{ file_id?: string; filename?: string; score?: number }>;
  };
  errors?: Array<{ message: string }>;
}

interface D1Lookup {
  id: string;
  numericId: number | null;
  titleFr: string | null;
  titleAr: string | null;
  typeSlug: string | null;
  subjectSlug: string | null;
  classSlug: string | null;
  pdfUrl: string | null;
  thumbnailUrl: string | null;
  teacherName: string | null;
}

async function getD1() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return (ctx as any).env?.DB || null;
  } catch {
    return null;
  }
}

/**
 * Parse the header of an AI Search hit's text file.
 * Each chunk's filename follows a convention: `text/{id}.txt` where the
 * file content (when present) starts with metadata keys we control.
 */
function extractResourceIdFromFilename(filename?: string): string | null {
  if (!filename) return null;
  // Pattern 1: text/{cuid}.txt
  const m1 = filename.match(/^text\/([a-z0-9]+)\.txt$/i);
  if (m1) return m1[1];
  // Pattern 2: bare cuid.txt
  const m2 = filename.match(/^([a-z0-9]{20,30})\.txt$/i);
  if (m2) return m2[1];
  return null;
}

/**
 * Parse metadata header from .txt content (if our ingestion script wrote one).
 * Falls back to empty metadata if header is missing.
 */
function parseContentHeader(content: string): {
  resourceId: string | null;
  metadata: Record<string, string>;
  body: string;
} {
  const lines = content.split('\n');
  const metadata: Record<string, string> = {};
  let i = 0;
  // Optional header block: "key: value\n---\n"
  if (lines[0]?.match(/^[a-z_]+:\s/i)) {
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '---' || line.trim() === '') break;
      const m = line.match(/^([a-z_]+):\s*(.+)$/i);
      if (m) metadata[m[1]] = m[2].trim();
    }
    if (lines[i]?.trim() === '---') i++;
  }
  const body = lines.slice(i).join('\n').trim();
  const resourceId =
    metadata.resource_id ||
    metadata.resourceId ||
    extractResourceIdFromFilename(metadata.filename) ||
    null;
  return { resourceId, metadata, body };
}

async function lookupResourcesByIds(
  db: any,
  ids: string[]
): Promise<Map<string, D1Lookup>> {
  const map = new Map<string, D1Lookup>();
  if (!db || ids.length === 0) return map;
  // D1 IN clause: placeholder count = ids.length
  const placeholders = ids.map(() => '?').join(',');
  try {
    const rows = await db
      .prepare(
        `SELECT r.id, r.numericId,
                r.titleFr, r.titleAr,
                t.slug AS typeSlug,
                s.slug AS subjectSlug,
                c.slug AS classSlug,
                (SELECT fileKey FROM ResourceFile WHERE resourceId = r.id AND kind = 'pdf' LIMIT 1) AS pdfKey,
                (SELECT fileKey FROM ResourceFile WHERE resourceId = r.id AND kind = 'thumbnail' LIMIT 1) AS thumbKey,
                (SELECT u.firstName || ' ' || u.lastName FROM User u WHERE u.id = r.teacherId LIMIT 1) AS teacherName
         FROM Resource r
         LEFT JOIN Type t ON t.id = r.typeId
         LEFT JOIN Subject s ON s.id = r.subjectId
         LEFT JOIN Class c ON c.id = r.classId
         WHERE r.id IN (${placeholders})`
      )
      .bind(...ids)
      .all();
    for (const row of rows.results || []) {
      const pdfUrl = row.pdfKey ? `/api/file/${row.pdfKey}` : null;
      const thumbnailUrl = row.thumbKey ? `/api/file/${row.thumbKey}` : null;
      const item: D1Lookup = {
        id: row.id,
        numericId: row.numericId,
        titleFr: row.titleFr,
        titleAr: row.titleAr,
        typeSlug: row.typeSlug,
        subjectSlug: row.subjectSlug,
        classSlug: row.classSlug,
        pdfUrl,
        thumbnailUrl,
        teacherName: row.teacherName,
      };
      map.set(row.id, item);
    }
  } catch (e) {
    console.error('[ai-search] D1 lookup failed:', e);
  }
  return map;
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const p = req.nextUrl.searchParams;
  const query = (p.get('q') || '').trim();

  // Rate limit (same as /api/search/v2)
  const rl = await rateLimitKv(req, 'search-ai', 30, 60 * 1000);
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  // Validate query
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { error: 'query_too_short', minLength: MIN_QUERY_LENGTH },
      { status: 400 }
    );
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: 'query_too_long', maxLength: MAX_QUERY_LENGTH },
      { status: 400 }
    );
  }

  // Get CF API token + config (NEVER hardcode the secret)
  const token = await getSecret('CF_API_TOKEN');
  if (!token) {
    console.error('[ai-search] CF_API_TOKEN missing — wrangler secret put needed');
    return NextResponse.json(
      {
        error: 'config_missing',
        message: 'CF_API_TOKEN secret not configured. Run: wrangler secret put CF_API_TOKEN',
      },
      { status: 503 }
    );
  }

  // Read config from env (with safe defaults matching wrangler.jsonc vars)
  const accountId = (await getSecret('CF_AI_SEARCH_ACCOUNT_ID')) || ACCOUNT_ID_DEFAULT;
  const instance = (await getSecret('CF_AI_SEARCH_INSTANCE')) || AI_SEARCH_INSTANCE_DEFAULT;

  // Forward to Cloudflare AI Search
  const cfUrl = `${CF_API_BASE}/accounts/${accountId}/ai-search/namespace/default/instances/${instance}/search`;
  let cfRes: Response;
  let cfBody: AiSearchResponse;
  try {
    cfRes = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        max_num_results: MAX_RESULTS,
        // AI Search returns chunks; we use them to build a lightweight
        // answer (no LLM in the loop per architecture).
        return_metadata: true,
        rerank: false,
      }),
    });
    cfBody = (await cfRes.json()) as AiSearchResponse;
  } catch (e: any) {
    console.error('[ai-search] CF fetch failed:', e);
    return NextResponse.json(
      { error: 'upstream_error', message: e?.message || 'unknown' },
      { status: 502 }
    );
  }

  if (!cfRes.ok || !cfBody.success) {
    const err = cfBody.errors?.[0]?.message || `CF returned ${cfRes.status}`;
    console.error('[ai-search] CF error:', err);
    return NextResponse.json(
      { error: 'upstream_error', message: err },
      { status: 502 }
    );
  }

  // Parse the response — collect hits, parse content headers
  const rawSources = cfBody.result?.sources || [];
  const hits: AiSearchHit[] = [];
  for (const s of rawSources) {
    const headerParsed = parseContentHeader(s.content || '');
    hits.push({
      file_id: s.file_id,
      filename: s.filename,
      content: s.content,
      score: s.score,
      metadata: headerParsed.metadata,
    });
  }

  // Lookup matching D1 resources for richer previews
  const resourceIds = hits
    .map((h) => extractResourceIdFromFilename(h.filename) || h.metadata?.resource_id)
    .filter((id): id is string => !!id);
  const db = await getD1();
  const d1Map = await lookupResourcesByIds(db, resourceIds);

  // Build the response
  const sources = hits.map((h) => {
    const rid = extractResourceIdFromFilename(h.filename) || h.metadata?.resource_id;
    const d1 = rid ? d1Map.get(rid) : null;
    const headerParsed = parseContentHeader(h.content || '');
    return {
      file_id: h.file_id,
      filename: h.filename,
      score: h.score,
      resourceId: rid,
      // D1 enrichment
      title: d1?.titleFr || d1?.titleAr || h.metadata?.title || null,
      titleAr: d1?.titleAr || null,
      typeSlug: d1?.typeSlug || null,
      subjectSlug: d1?.subjectSlug || null,
      classSlug: d1?.classSlug || null,
      teacherName: d1?.teacherName || null,
      pdfUrl: d1?.pdfUrl || null,
      thumbnailUrl: d1?.thumbnailUrl || null,
      numericId: d1?.numericId || null,
      // Excerpt from chunk (first 280 chars)
      excerpt: (headerParsed.body || h.content || '').slice(0, 280).trim(),
    };
  });

  // Lightweight answer (no LLM) — concatenate the top 3 excerpts.
  // This is a placeholder until we decide whether to add a generation LLM.
  const top3 = sources.slice(0, 3);
  const pseudoAnswer =
    top3.length > 0
      ? top3
          .map((s, i) => `${i + 1}. ${s.title || s.filename} — ${s.excerpt || '(extrait non disponible)'}`)
          .join('\n\n')
      : 'Aucun résultat pertinent trouvé.';

  return NextResponse.json(
    {
      query,
      answer: pseudoAnswer,
      sources,
      total: sources.length,
      durationMs: Date.now() - t0,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    }
  );
}

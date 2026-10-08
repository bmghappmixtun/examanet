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
  id?: string;
  type?: string;
  score?: number;
  text?: string;
  item?: {
    key?: string;        // e.g. "text/cmr93f6sc005or2zipgyeqlbw.txt"
    metadata?: Record<string, any>;
  };
  scoring_details?: { vector_score?: number };
}

interface AiSearchResponse {
  success: boolean;
  result?: {
    query_kind?: string;
    search_query?: string;
    chunks?: AiSearchHit[];
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
 * Extract resource CUID from the AI Search item key.
 * Pattern: "text/{cuid}.txt" → {cuid}
 */
function extractResourceIdFromKey(key?: string): string | null {
  if (!key) return null;
  const m = key.match(/^text\/([a-z0-9]+)\.txt$/i);
  if (m) return m[1];
  return null;
}

/**
 * Parse the structured header that the ingestion script writes to each .txt
 * chunk. Real format (confirmed 2026-10-08):
 *
 *   # Titre - Matière - Niveau - Section (année) : Topic
 *
 *   PDF original: /api/file/teacher-library/{teacherId}/imported/{fileKey}.pdf
 *   Resource ID: {cuid}
 *
 *   Matière: ...
 *   Niveau: ...
 *   Prof(s): ...
 *   Durée estimée: ...
 *   Topics: ...
 *   Tags: ...
 *   Concepts clés: ...
 *   ...
 *
 *   ---
 *
 *   {PDF text content}
 */
function parseContentHeader(content: string): {
  title: string | null;
  resourceId: string | null;
  pdfPath: string | null;
  metadata: Record<string, string>;
  body: string;
} {
  const lines = content.split('\n');
  const metadata: Record<string, string> = {};
  let i = 0;

  // Line 0: "# Titre - Matière - Niveau - Section (année) : Topic"
  let title: string | null = null;
  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim();
    i = 1;
  }

  // Skip blank line between title and PDF original
  while (i < lines.length && lines[i].trim() === '') i++;

  // Parse "Key: value" lines until we hit "---" or the body
  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '---') {
      i++;
      break;
    }
    if (trimmed === '') continue;
    // Match "Key: value" — accept keys with parentheses like "Concepts clés:"
    const m = line.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*?):\s*(.+)$/);
    if (m) metadata[m[1].trim()] = m[2].trim();
    else break; // non-key-value line = body starts here
  }

  const body = lines.slice(i).join('\n').trim();
  const resourceId = metadata['Resource ID'] || null;
  const pdfPath = metadata['PDF original'] || null;
  return { title, resourceId, pdfPath, metadata, body };
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
  // 2026-10-08: correct endpoint is /ai-search/instances/{instance}/search
  // (NOT /ai-search/namespace/default/instances/{instance}/search — 404)
  const cfUrl = `${CF_API_BASE}/accounts/${accountId}/ai-search/instances/${instance}/search`;
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
  const chunks = cfBody.result?.chunks || [];
  const hits: AiSearchHit[] = chunks;

  // Lookup matching D1 resources for richer previews
  const resourceIds = hits
    .map((h) => extractResourceIdFromKey(h.item?.key))
    .filter((id): id is string => !!id);
  const db = await getD1();
  const d1Map = await lookupResourcesByIds(db, resourceIds);

  // Build the response
  const sources = hits.map((h) => {
    const rid = extractResourceIdFromKey(h.item?.key);
    const d1 = rid ? d1Map.get(rid) : null;
    const headerParsed = parseContentHeader(h.text || '');
    return {
      id: h.id,
      itemKey: h.item?.key,
      score: h.score,
      resourceId: rid,
      // Header-parsed metadata (always present if ingestion ran)
      title: headerParsed.title,
      matiere: headerParsed.metadata['Matière'] || null,
      niveau: headerParsed.metadata['Niveau'] || null,
      profs: headerParsed.metadata['Prof(s)'] || null,
      tags: headerParsed.metadata['Tags'] || null,
      pdfPath: headerParsed.pdfPath, // e.g. "/api/file/teacher-library/.../imported/...pdf"
      // D1 enrichment (numeric ID + thumbnail)
      numericId: d1?.numericId || null,
      thumbnailUrl: d1?.thumbnailUrl || null,
      // Excerpt from chunk body (first 320 chars)
      excerpt: (headerParsed.body || h.text || '').slice(0, 320).trim(),
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

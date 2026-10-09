// @ts-nocheck
/**
 * /api/search/ai — Cloudflare AI Search CHAT proxy
 *
 * 2026-10-08 v3: migrated from /search (pure retrieval) to
 *   /chat/completions (managed RAG with LLM generation).
 *
 * Architecture (3 layers, WITH LLM in the loop):
 *   1. USER  (frontend /recherche-ai or /api/search/ai)
 *   2. WORKER PROXY  (this route — thin pass-through)
 *        - validate query
 *        - locale detect (FR / AR / darija) → system prompt
 *        - forward to CF AI Search /chat/completions
 *        - parse response + chunks (sources)
 *        - lookup D1 Resource for richer previews
 *   3. CF AI SEARCH  (managed RAG, @cf/openai/gpt-oss-120b default model)
 *        - embeds query with qwen3-embedding-0.6b
 *        - retrieves top-K chunks (1024-dim, 14k indexed PDFs)
 *        - generates answer in user's language
 *
 * Auth: CF_API_TOKEN via getSecret() (NEVER hardcode).
 * Rate limit: 20 req/min/IP (LLM is expensive).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { rateLimitKv, rateLimitResponse } from '@/lib/rate-limit-kv';
import { getSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCOUNT_ID_DEFAULT = '59cffdeaadf3809cc3d2039c43f836e0';
const AI_SEARCH_INSTANCE_DEFAULT = 'examanet-text-search-v2';
const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 500;
const MAX_RESULTS = 6;

const SYSTEM_PROMPTS: Record<string, string> = {
  fr: `Tu es un assistant pédagogique pour les élèves tunisiens (collège 7-9 et lycée 1-4).
Tu réponds en français de manière claire et structurée, en utilisant le markdown (titres, listes, **gras**).

RÈGLES STRICTES POUR LES FORMULES MATHÉMATIQUES:
- TOUJOURS entourer les formules inline avec \\(...\\): ex. \\(\\sin(x) = \\frac{1}{2}\\)
- TOUJOURS entourer les blocs avec \\[...\\]: ex. \\[\\Delta = b^2 - 4ac\\]
- JAMAIS laisser une commande LaTeX nue (\\frac, \\sqrt, \\sin, \\cos, \\ln, etc.) sans délimiteur
- Utiliser \\(Unicode\\Omega pour les lettres grecques: \\alpha, \\beta, \\Delta, \\Omega, \\pi, \\theta
- Utiliser les noms courts: \\(x\\), \\(ax^2+bx+c\\), etc.

Tu cites tes sources en mentionnant le titre de la ressource et la matière/niveau.
Si la question est ambiguë, propose des pistes. Si tu n'as pas assez d'information dans les sources, dis-le honnêtement.
Longueur cible: 150-300 mots. Ne dépasse pas 500 mots sauf si on te demande une explication approfondie.`,
  ar: `أنت مساعد تربوي للطلاب التونسيين (المرحلة الإعدادية 7-9 والثانوية 1-4).
أجب بالعربية بشكل واضح ومنظم، واستخدم markdown (عناوين، قوائم، **عريض**).

قواعد صارمة للصيغ الرياضية:
- ضع دائماً الصيغ المضمنة بين \\(...\\): مثل \\(\\sin(x) = \\frac{1}{2}\\)
- ضع دائماً الكتل بين \\[...\\]: مثل \\[\\Delta = b^2 - 4ac\\]
- لا تترك أي أمر LaTeX بدون محددات
- استخدم اليونانية: \\alpha، \\beta، \\Delta، \\Omega

اذكر المصادر من خلال ذكر عنوان المورد والمادة/المستوى.
إذا كان السؤال غامضًا، اقترح اتجاهات. إذا لم تتوفر معلومات كافية، قل ذلك بصراحة.
الطول المستهدف: 150-300 كلمة. لا تتجاوز 500 كلمة.`,
  darija: `T'es un assistant pédagogique pour les élèves tunisiens (collège 7-9 w lycée 1-4).
Réponds en darija tunisienne (mélange arabe/français) de manière simple, comme un grand frère qui explique.

Règles strictes pour les formules:
- TOUJOURS entourer les formules inline avec \\(...\\)
- TOUJOURS entourer les blocs avec \\[...\\]
- JAMAIS laisser une commande LaTeX nue (\\frac, \\sqrt, etc.) sans délimiteur

Utilise markdown si nécessaire. Cite les sources par leur titre.
Si tu connais pas la réponse, dis-le franchement au lieu d'inventer.`,
};

function detectLocale(query: string, explicit?: string): 'fr' | 'ar' | 'darija' {
  if (explicit && (explicit === 'fr' || explicit === 'ar' || explicit === 'darija')) {
    return explicit as 'fr' | 'ar' | 'darija';
  }
  // Arabic Unicode range (basic + extended)
  const arabicChars = (query.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const latinChars = (query.match(/[a-zA-Z]/g) || []).length;
  if (arabicChars > latinChars * 0.5) {
    // Detected Arabic — check if it's darija (lots of latin script mixed in)
    if (arabicChars >= 2 && latinChars >= 2 && arabicChars < query.length * 0.7) {
      return 'darija';
    }
    return 'ar';
  }
  return 'fr';
}

interface ChatChunk {
  id?: string;
  type?: string;
  score?: number;
  text?: string;
  item?: {
    key?: string;
    metadata?: Record<string, any>;
  };
  scoring_details?: { vector_score?: number };
}

interface ChatChoice {
  finish_reason?: string;
  index?: number;
  message?: {
    role?: string;
    content?: string;
    reasoning?: string;        // gpt-oss-120b exposes CoT
    reasoning_content?: string;
  };
}

interface ChatResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: ChatChoice[];
  chunks?: ChatChunk[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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

/** Extract resource CUID from the AI Search item key (text/{cuid}.txt) */
function extractResourceIdFromKey(key?: string): string | null {
  if (!key) return null;
  const m = key.match(/^text\/([a-z0-9]+)\.txt$/i);
  return m ? m[1] : null;
}

/**
 * Parse the structured header that the ingestion script writes to each
 * .txt chunk. Format:
 *   # Titre - Matière - Niveau - Section (année) : Topic
 *   PDF original: /api/file/.../...pdf
 *   Resource ID: {cuid}
 *   Matière: ... / Niveau: ... / Prof(s): ... / Tags: ...
 *   ---
 *   {PDF body}
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

  let title: string | null = null;
  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim();
    i = 1;
  }
  while (i < lines.length && lines[i].trim() === '') i++;

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '---') { i++; break; }
    if (trimmed === '') continue;
    const m = line.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*?):\s*(.+)$/);
    if (m) metadata[m[1].trim()] = m[2].trim();
    else break;
  }

  const body = lines.slice(i).join('\n').trim();
  return {
    title,
    resourceId: metadata['Resource ID'] || null,
    pdfPath: metadata['PDF original'] || null,
    metadata,
    body,
  };
}

async function lookupResourcesByIds(
  db: any,
  ids: string[]
): Promise<Map<string, D1Lookup>> {
  const map = new Map<string, D1Lookup>();
  if (!db || ids.length === 0) return map;
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
      map.set(row.id, {
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
      });
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
  const explicitLocale = p.get('locale') || undefined;

  // Rate limit — 20 req/min (LLM is more expensive than keyword search)
  const rl = await rateLimitKv(req, 'search-ai', 20, 60 * 1000);
  if (!rl.allowed) return rateLimitResponse(rl);

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

  // Get CF API token (NEVER hardcode)
  const token = await getSecret('CF_API_TOKEN');
  if (!token) {
    return NextResponse.json(
      {
        error: 'config_missing',
        message: 'CF_API_TOKEN secret not configured. Run: wrangler secret put CF_API_TOKEN',
      },
      { status: 503 }
    );
  }

  const accountId = (await getSecret('CF_AI_SEARCH_ACCOUNT_ID')) || ACCOUNT_ID_DEFAULT;
  const instance = (await getSecret('CF_AI_SEARCH_INSTANCE')) || AI_SEARCH_INSTANCE_DEFAULT;
  const locale = detectLocale(query, explicitLocale);
  const systemPrompt = SYSTEM_PROMPTS[locale];

  // Call CF AI Search chat/completions endpoint
  // Model: @cf/openai/gpt-oss-120b (default, ~120B params, multilingual, great for FR/AR/darija)
  // Override with CF_AI_SEARCH_MODEL env if you want (e.g. "@cf/meta/llama-3.3-70b-instruct-fp8-fast")
  const customModel = await getSecret('CF_AI_SEARCH_MODEL');
  const model = customModel || '@cf/openai/gpt-oss-120b';

  const cfUrl = `${CF_API_BASE}/accounts/${accountId}/ai-search/instances/${instance}/chat/completions`;

  let cfRes: Response;
  let cfBody: ChatResponse;
  try {
    cfRes = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        max_num_results: MAX_RESULTS,
        // stream: false → simple JSON response (we could later add SSE)
      }),
      // AI Search chat can be slow (5-10s)
      // @ts-ignore — Node fetch supports signal
      signal: AbortSignal.timeout(30_000),
    });
    cfBody = (await cfRes.json()) as ChatResponse;
  } catch (e: any) {
    console.error('[ai-search] CF fetch failed:', e);
    return NextResponse.json(
      { error: 'upstream_error', message: e?.message || 'unknown' },
      { status: 502 }
    );
  }

  if (!cfRes.ok) {
    const errMsg = (cfBody as any)?.errors?.[0]?.message || `CF returned ${cfRes.status}`;
    console.error('[ai-search] CF error:', errMsg);
    return NextResponse.json(
      { error: 'upstream_error', message: errMsg },
      { status: 502 }
    );
  }

  // Extract LLM answer + reasoning (CoT)
  const message = cfBody.choices?.[0]?.message;
  const answer = message?.content || '';
  const reasoning = message?.reasoning || message?.reasoning_content || '';

  // Parse sources (chunks) for source cards
  const chunks: ChatChunk[] = cfBody.chunks || [];
  const resourceIds = chunks
    .map((c) => extractResourceIdFromKey(c.item?.key))
    .filter((id): id is string => !!id);
  const db = await getD1();
  const d1Map = await lookupResourcesByIds(db, resourceIds);

  const sources = chunks.map((c) => {
    const rid = extractResourceIdFromKey(c.item?.key);
    const d1 = rid ? d1Map.get(rid) : null;
    const headerParsed = parseContentHeader(c.text || '');
    return {
      id: c.id,
      itemKey: c.item?.key,
      score: c.score,
      resourceId: rid,
      title: headerParsed.title,
      matiere: headerParsed.metadata['Matière'] || null,
      niveau: headerParsed.metadata['Niveau'] || null,
      profs: headerParsed.metadata['Prof(s)'] || null,
      tags: headerParsed.metadata['Tags'] || null,
      pdfPath: headerParsed.pdfPath,
      numericId: d1?.numericId || null,
      thumbnailUrl: d1?.thumbnailUrl || null,
      excerpt: (headerParsed.body || c.text || '').slice(0, 320).trim(),
    };
  });

  return NextResponse.json(
    {
      query,
      locale,
      model,
      answer,         // LLM-generated markdown answer
      reasoning,      // Chain-of-thought (optional, exposed for debugging)
      sources,
      total: sources.length,
      usage: cfBody.usage,  // tokens (for monitoring cost)
      durationMs: Date.now() - t0,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    }
  );
}

// @ts-nocheck
/**
 * /api/search/ai — Cloudflare AI Search CHAT proxy
 *
 * 2026-10-08 v3: migrated from /search (pure retrieval) to
 *   /chat/completions (managed RAG with LLM generation).
 * 2026-10-10 v4: added SSE streaming (token-by-token progressive answer)
 *   - client: ?stream=1 OR Accept: text/event-stream
 *   - server: forwards CF AI Search SSE deltas as our own SSE protocol
 *   - protocol: data: {type:'content'|'reasoning'|'done'|'error', ...}
 *
 * Architecture (3 layers, WITH LLM in the loop):
 *   1. USER  (frontend /recherche-ai or /api/search/ai)
 *   2. WORKER PROXY  (this route — thin pass-through, supports SSE)
 *   3. CF AI SEARCH  (managed RAG, @cf/openai/gpt-oss-120b default)
 *
 * Auth: CF_API_TOKEN via getSecret() (NEVER hardcode).
 * Rate limit: 20 req/min/IP.
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
  const arabicChars = (query.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const latinChars = (query.match(/[a-zA-Z]/g) || []).length;
  if (arabicChars > latinChars * 0.5) {
    if (arabicChars >= 2 && latinChars >= 2 && arabicChars < query.length * 0.7) {
      return 'darija';
    }
    return 'ar';
  }
  return 'fr';
}

interface ChatChoice {
  finish_reason?: string;
  index?: number;
  message?: {
    role?: string;
    content?: string;
    reasoning?: string;
    reasoning_content?: string;
  };
  // streaming
  delta?: {
    role?: string;
    content?: string;
    reasoning?: string;
    reasoning_content?: string;
  };
}

interface ChatResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: ChatChoice[];
  chunks?: any[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

async function getD1() {
  try {
    const ctx = await getCloudflareContext({ async: true });
    return (ctx as any).env?.DB || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const p = req.nextUrl.searchParams;
  const query = (p.get('q') || '').trim();
  const explicitLocale = p.get('locale') || undefined;
  const wantsStream =
    p.get('stream') === '1' ||
    (req.headers.get('accept') || '').includes('text/event-stream');

  // Rate limit
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

  const customModel = await getSecret('CF_AI_SEARCH_MODEL');
  const model = customModel || '@cf/openai/gpt-oss-120b';

  const cfUrl = `${CF_API_BASE}/accounts/${accountId}/ai-search/instances/${instance}/chat/completions`;

  // Build CF request body (with optional streaming)
  const cfBody = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ],
    max_num_results: MAX_RESULTS,
    ...(wantsStream ? { stream: true } : {}),
  };

  let cfRes: Response;
  try {
    cfRes = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: wantsStream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(cfBody),
      // CF AI Search chat can be slow; allow up to 60s
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    console.error('[ai-search] CF fetch failed:', e);
    return NextResponse.json(
      { error: 'upstream_error', message: e?.message || 'unknown' },
      { status: 502 }
    );
  }

  if (!cfRes.ok) {
    const errText = await cfRes.text().catch(() => '');
    console.error('[ai-search] CF error:', cfRes.status, errText.slice(0, 500));
    return NextResponse.json(
      {
        error: 'upstream_error',
        message: `CF returned ${cfRes.status}`,
        detail: errText.slice(0, 500),
      },
      { status: 502 }
    );
  }

  // Streaming path: forward SSE chunks
  if (wantsStream) {
    return streamFromCf(cfRes, model, locale, t0);
  }

  // Non-streaming: parse JSON
  const cfBody2 = (await cfRes.json()) as ChatResponse;
  const message = cfBody2.choices?.[0]?.message;
  const answer = message?.content || '';
  const reasoning = message?.reasoning || message?.reasoning_content || '';

  return NextResponse.json(
    {
      query,
      locale,
      model,
      answer,
      reasoning,
      sources: [], // kept for backwards compat; no longer displayed
      total: 0,
      usage: cfBody2.usage,
      durationMs: Date.now() - t0,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    }
  );
}

/**
 * Forward CF AI Search SSE stream to client.
 * CF sends OpenAI-compatible deltas:
 *   data: {"id":"...","choices":[{"delta":{"content":"hello"}}]}
 *   data: {"id":"...","choices":[{"delta":{"content":" world"}}]}
 *   data: [DONE]
 * We re-emit as a simpler protocol:
 *   data: {"type":"meta","model":"...","locale":"..."}
 *   data: {"type":"content","text":"..."}
 *   data: {"type":"reasoning","text":"..."}
 *   data: {"type":"done","usage":{...},"durationMs":...}
 *   data: {"type":"error","message":"..."}
 */
function streamFromCf(
  cfRes: Response,
  model: string,
  locale: string,
  t0: number
): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Fire-and-forget the pump
  (async () => {
    const reader = cfRes.body!.getReader();
    let buffer = '';
    let usage: any = null;
    let sentMeta = false;

    const writeEvent = async (obj: any) => {
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      } catch {
        // writer closed; ignore
      }
    };

    try {
      // Meta event (model + locale) before the first token
      if (!sentMeta) {
        await writeEvent({ type: 'meta', model, locale });
        sentMeta = true;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep last partial line

        for (const rawLine of lines) {
          const line = rawLine.trimEnd();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;

          if (data === '[DONE]') {
            await writeEvent({
              type: 'done',
              usage,
              durationMs: Date.now() - t0,
            });
            continue;
          }

          let chunk: any;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue; // skip malformed lines
          }

          if (chunk.usage) usage = chunk.usage;
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta;
          if (!delta) continue;

          // Reasoning first (gpt-oss-120b emits CoT as 'reasoning' or 'reasoning_content')
          const reasoningText = delta.reasoning || delta.reasoning_content;
          if (reasoningText) {
            await writeEvent({ type: 'reasoning', text: reasoningText });
          }
          // Then content
          if (delta.content) {
            await writeEvent({ type: 'content', text: delta.content });
          }
        }
      }

      // If we never got [DONE] (CF sometimes just closes the stream), emit done
      await writeEvent({
        type: 'done',
        usage,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      console.error('[ai-search] stream error:', e);
      await writeEvent({
        type: 'error',
        message: e?.message || 'stream error',
      });
    } finally {
      try {
        await writer.close();
      } catch {
        // already closed
      }
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

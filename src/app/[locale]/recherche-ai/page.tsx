// @ts-nocheck
/**
 * /fr/recherche-ai — AI-powered semantic search UI
 *
 * 2026-10-08 v3: Cloudflare AI Search CHAT (with LLM @cf/openai/gpt-oss-120b).
 * - Renders the LLM answer as markdown (titles, lists, **bold**, LaTeX)
 * - Locale detection: FR / AR / darija → server uses matching system prompt
 * - Source cards below the answer
 * - Reasoning (chain-of-thought) hidden by default, toggle to show
 * - Recent queries in localStorage
 *
 * Stack: Client component (useState/useEffect).
 */

'use client';

import { useEffect, useRef, useState } from 'react';
// (useEffect is already imported at the top)
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'next-intl';

interface AiSource {
  id?: string;
  itemKey?: string;
  score?: number;
  resourceId?: string;
  numericId?: number | null;
  title?: string | null;
  matiere?: string | null;
  niveau?: string | null;
  profs?: string | null;
  tags?: string | null;
  pdfPath?: string | null;
  thumbnailUrl?: string | null;
  excerpt?: string;
}

interface AiResponse {
  query: string;
  locale?: 'fr' | 'ar' | 'darija';
  model?: string;
  answer?: string;
  reasoning?: string;
  sources?: AiSource[];
  total?: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  durationMs?: number;
  error?: string;
  message?: string;
}

const STORAGE_KEY = 'examanet:ai-search:recent';
const MAX_RECENT = 5;

export default function RechercheAiPage() {
  const locale = useLocale() as 'fr' | 'ar';
  const router = useRouter();
  const isAr = locale === 'ar';

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResponse | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent queries on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRecent(JSON.parse(raw).slice(0, MAX_RECENT));
    } catch {
      // ignore
    }
    inputRef.current?.focus();
  }, []);

  function pushRecent(q: string) {
    if (!q || q.length < 2) return;
    setRecent((prev) => {
      const next = [q, ...prev.filter((x) => x !== q)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    setQuery(trimmed);
    setLoading(true);
    setError(null);
    setResult(null);
    pushRecent(trimmed);
    const t0 = performance.now();
    try {
      const res = await fetch(
        `/api/search/ai?q=${encodeURIComponent(trimmed)}&locale=${locale}`,
        { method: 'GET', headers: { Accept: 'application/json' } }
      );
      const data: AiResponse = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || `Erreur ${res.status}`);
      } else {
        setResult(data);
        setShowReasoning(false); // reset on new query
      }
    } catch (e: any) {
      setError(e?.message || 'Erreur réseau');
    } finally {
      const t1 = performance.now();
      console.log(`[recherche-ai] ${trimmed} → ${(t1 - t0).toFixed(0)}ms`);
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(query);
  }

  // i18n strings (kept inline to avoid prop drilling)
  const t = {
    title: isAr ? 'البحث الذكي' : 'Recherche IA',
    subtitle: isAr
      ? 'ابحث في آلاف الموارد بالعربية أو الفرنسية أو الدارجة. مدعوم بـ Cloudflare AI Search.'
      : 'Recherche sémantique dans 14 000+ ressources (PDFs, cours, devoirs). FR / AR / darija. Propulsé par Cloudflare AI Search.',
    placeholder: isAr
      ? 'اسأل سؤالاً… (مثال: كيف نحل معادلة من الدرجة الثانية؟)'
      : 'Pose ta question… (ex: équations du second degré)',
    ask: isAr ? 'ابحث' : 'Rechercher',
    loading: isAr ? 'جاري التفكير…' : 'Réflexion en cours…',
    noResult: isAr
      ? 'لا توجد نتائج. جرّب كلمات مختلفة.'
      : 'Aucun résultat. Essaie d\'autres mots-clés.',
    exampleQueries: isAr
      ? ['معادلات من الدرجة الثانية', 'قانون أوم', 'الدوال المثلثية', 'كيفاش نحل exercice']
      : ['équations du second degré', 'loi d\'Ohm', 'fonctions trigonométriques', 'درّسني كيفاش نحل exercice'],
    recent: isAr ? 'عمليات البحث الأخيرة' : 'Recherches récentes',
    poweredBy: isAr ? 'مدعوم بـ' : 'Propulsé par',
    open: isAr ? 'فتح' : 'Ouvrir',
    excerpt: isAr ? 'مقتطف' : 'Extrait',
    sources: isAr ? 'المصادر' : 'Sources',
    sourcesLabel: isAr ? 'مصدر' : 'sources',
    score: isAr ? 'النتيجة' : 'Score',
    aiAnswer: isAr ? 'إجابة الذكاء الاصطناعي' : 'Réponse IA',
    showReasoning: isAr ? 'عرض التفكير' : 'Voir le raisonnement',
    hideReasoning: isAr ? 'إخفاء' : 'Masquer',
    reasoningLabel: isAr ? 'تفكير النموذج' : 'Raisonnement du modèle',
    fallbackCta: isAr
      ? 'لا تجد ما تبحث عنه؟ جرّب البحث الكلاسيكي.'
      : 'Tu ne trouves pas ? Essaie la recherche classique.',
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-semibold mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="m4.93 4.93 2.83 2.83" />
              <path d="m16.24 16.24 2.83 2.83" />
              <path d="M2 12h4" />
              <path d="M18 12h4" />
              <path d="m4.93 19.07 2.83-2.83" />
              <path d="m16.24 7.76 2.83-2.83" />
            </svg>
            {t.poweredBy} Cloudflare AI Search
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3">
            {t.title}
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto text-base sm:text-lg">
            {t.subtitle}
          </p>
        </div>

        {/* Search input */}
        <form onSubmit={onSubmit} className="mb-8">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.placeholder}
              className="w-full h-14 ps-12 pe-32 rounded-2xl border-2 border-slate-200 bg-white focus:border-primary-400 focus:ring-4 focus:ring-primary-100 outline-none transition text-base"
              autoComplete="off"
              disabled={loading}
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute top-1/2 -translate-y-1/2 start-4 text-slate-400"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <button
              type="submit"
              disabled={loading || query.trim().length < 2}
              className="absolute top-1/2 -translate-y-1/2 end-2 h-10 px-5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? '…' : t.ask}
            </button>
          </div>
        </form>

        {/* Recent searches */}
        {!result && !loading && recent.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              {t.recent}
            </h3>
            <div className="flex flex-wrap gap-2">
              {recent.map((q) => (
                <button
                  key={q}
                  onClick={() => runSearch(q)}
                  className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Example queries */}
        {!result && !loading && (
          <div className="mb-8">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              {isAr ? 'أمثلة' : 'Exemples'}
            </h3>
            <div className="flex flex-wrap gap-2">
              {t.exampleQueries.map((q) => (
                <button
                  key={q}
                  onClick={() => runSearch(q)}
                  className="px-3 py-1.5 rounded-full bg-primary-50 text-primary-700 text-sm hover:bg-primary-100 transition border border-primary-100"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-block w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <p className="mt-4 text-slate-600">{t.loading}</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-800">
            <p className="font-semibold mb-1">⚠️ {error}</p>
            {error.includes('CF_API_TOKEN') && (
              <p className="text-sm mt-2 font-mono text-xs">
                wrangler secret put CF_API_TOKEN
              </p>
            )}
            <Link
              href="/recherche"
              className="inline-block mt-3 text-sm text-primary-700 underline"
            >
              {t.fallbackCta}
            </Link>
          </div>
        )}

        {/* Result */}
        {result && !loading && !error && (
          <div className="space-y-6">
            {/* LLM-generated answer (markdown) */}
            {result.answer && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
                      {t.aiAnswer}
                    </span>
                    {result.locale && (
                      <span className="text-xs text-slate-400">
                        {result.locale === 'ar' ? 'العربية' : result.locale === 'darija' ? 'دارجي' : 'FR'}
                      </span>
                    )}
                    {result.model && (
                      <span className="text-xs text-slate-400 font-mono">
                        {result.model.replace('@cf/', '')}
                      </span>
                    )}
                  </div>
                  {result.reasoning && (
                    <button
                      onClick={() => setShowReasoning((v) => !v)}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      {showReasoning ? t.hideReasoning : t.showReasoning}
                    </button>
                  )}
                </div>

                <MarkdownLite content={result.answer} />

                {result.reasoning && showReasoning && (
                  <details className="mt-4 pt-4 border-t border-slate-100">
                    <summary className="text-xs font-semibold text-slate-500 cursor-pointer">
                      {t.reasoningLabel}
                    </summary>
                    <pre className="mt-2 text-xs text-slate-600 whitespace-pre-wrap font-mono">
                      {result.reasoning}
                    </pre>
                  </details>
                )}

                {result.durationMs != null && (
                  <p className="text-xs text-slate-400 mt-4">
                    {result.durationMs}ms · {result.sources?.length ?? 0} {t.sourcesLabel}
                    {result.usage?.total_tokens != null &&
                      ` · ${result.usage.total_tokens.toLocaleString()} tokens`}
                  </p>
                )}
              </div>
            )}

            {/* Source cards */}
            {result.sources && result.sources.length > 0 && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  {t.sources} · {result.total}
                </h2>
                <div className="grid gap-3">
                  {result.sources.map((s, i) => (
                    <SourceCard key={`${s.id}-${i}`} source={s} locale={locale} t={t} />
                  ))}
                </div>
              </div>
            )}

            {result.sources?.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                {t.noResult}
              </div>
            )}

            <div className="text-center pt-4">
              <Link
                href="/recherche"
                className="text-sm text-slate-500 hover:text-slate-700 underline"
              >
                {t.fallbackCta}
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * Lightweight markdown renderer — handles:
 *   # ## ### headings
 *   **bold**, *italic*
 *   `inline code`
 *   - lists / 1. ordered lists
 *   > blockquote
 *   ```code blocks```
 *   LaTeX: $...$ and $$...$$ (passed through, browser renders as text)
 *   newlines / paragraphs
 *
 * Avoids pulling in a 100kb markdown library for a small block of LLM
 * output. The result is HTML safe (we escape first, then apply patterns).
 */
function MarkdownLite({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = renderMarkdown(content);
  // After every content change, run KaTeX's auto-render on the new DOM.
  // Retry up to 10× (200ms apart) to handle slow CDN load on first render.
  useEffect(() => {
    if (typeof window === 'undefined' || !ref.current) return;
    let attempts = 0;
    const maxAttempts = 10;
    const tryRender = () => {
      // @ts-ignore - renderMathInElement is added by katex/contrib/auto-render
      if (typeof window.renderMathInElement === 'function') {
        try {
          // @ts-ignore
          window.renderMathInElement(ref.current, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\[', right: '\\]', display: true },
              { left: '\\(', right: '\\)', display: false },
            ],
            throwOnError: false,
            errorColor: '#dc2626',
          });
        } catch (e) {
          // silent
        }
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(tryRender, 200);
      }
    };
    // Two RAFs: 1) React commits DOM, 2) layout settles, then render
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(tryRender);
    });
    return () => cancelAnimationFrame(id);
  }, [content]);
  return (
    <div
      ref={ref}
      id="ai-answer-body"
      className="prose prose-slate max-w-none text-slate-800 text-sm leading-relaxed
                 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
                 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2
                 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
                 [&_p]:my-2
                 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-6
                 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-6
                 [&_li]:my-1
                 [&_strong]:font-semibold
                 [&_em]:italic
                 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
                 [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-xs
                 [&_blockquote]:border-s-4 [&_blockquote]:border-slate-300 [&_blockquote]:ps-4 [&_blockquote]:italic [&_blockquote]:text-slate-600
                 [&_table]:w-full [&_table]:my-2
                 [&_th]:bg-slate-100 [&_th]:p-2 [&_th]:text-start [&_th]:font-semibold [&_th]:border [&_th]:border-slate-200
                 [&_td]:p-2 [&_td]:border [&_td]:border-slate-200"
      dir="auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(md: string): string {
  let text = md;
  // 1. Escape HTML
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Code blocks ```...``` (process first so other patterns don't touch them)
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // 3. Inline code `...`
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 4. Headings
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 5. Bold + italic
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  // 6. Blockquote
  text = text.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // 7. Unordered lists (consecutive lines starting with - or *)
  text = text.replace(/(^[-*] .+(?:\n[-*] .+)*)/gm, (block) => {
    const items = block
      .split('\n')
      .map((l) => l.replace(/^[-*] /, '').trim())
      .map((l) => `<li>${l}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  });

  // 8. Ordered lists (consecutive lines starting with "1. " "2. " etc)
  text = text.replace(/(^\d+\. .+(?:\n\d+\. .+)*)/gm, (block) => {
    const items = block
      .split('\n')
      .map((l) => l.replace(/^\d+\. /, '').trim())
      .map((l) => `<li>${l}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  });

  // 9. Tables (simple GFM: |col|col|)
  text = text.replace(
    /(^\|.+\|\n\|[-:|\s]+\|(?:\n\|.+\|)+)/gm,
    (block) => {
      const lines = block.split('\n').filter((l) => l.trim());
      if (lines.length < 2) return block;
      const head = lines[0]
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      const rows = lines.slice(2).map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim())
      );
      const thead = '<thead><tr>' + head.map((h) => `<th>${h}</th>`).join('') + '</tr></thead>';
      const tbody =
        '<tbody>' +
        rows
          .map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>')
          .join('') +
        '</tbody>';
      return `<table>${thead}${tbody}</table>`;
    }
  );

  // 10. Paragraphs: split by double newline, wrap each in <p>
  text = text
    .split(/\n{2,}/)
    .map((block) => {
      if (/^<(h\d|ul|ol|pre|blockquote|table)/.test(block.trim())) return block;
      return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  return text;
}

function SourceCard({
  source,
  locale,
  t,
}: {
  source: AiSource;
  locale: 'fr' | 'ar';
  t: any;
}) {
  const title = source.title;
  // Link priority: 1) resource page (if numericId) 2) PDF 3) '#'
  const href =
    source.numericId
      ? `/${locale}/ressources/${source.numericId}`
      : source.pdfPath
      ? source.pdfPath
      : '#';
  const score = source.score != null ? (source.score * 100).toFixed(0) : null;
  return (
    <a
      href={href}
      target={source.pdfPath && !source.numericId ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="block bg-white border border-slate-200 rounded-2xl p-5 hover:border-primary-300 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className="font-bold text-slate-900 line-clamp-2 mb-1 text-sm">
              {title}
            </h3>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {source.matiere && (
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                {source.matiere}
              </span>
            )}
            {source.niveau && (
              <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">
                {source.niveau}
              </span>
            )}
            {source.profs && <span className="truncate max-w-[200px]">· {source.profs}</span>}
          </div>
        </div>
        {score != null && (
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
            {score}%
          </span>
        )}
      </div>
      {source.excerpt && (
        <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed" dir="ltr">
          {source.excerpt}
        </p>
      )}
    </a>
  );
}

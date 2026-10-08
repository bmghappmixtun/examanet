// @ts-nocheck
/**
 * /fr/recherche-ai — AI-powered semantic search UI
 *
 * 2026-10-08: Reconstructed. Forwards queries to /api/search/ai
 * which queries the Cloudflare AI Search instance
 * `examanet-text-search-v2` (14k PDFs indexed, qwen3-embedding-0.6b).
 *
 * Stack: Client component (useState/useEffect). No SSR data.
 *
 * Behaviour:
 *   - User types a query (FR / AR / darija tolerated — embedding is
 *     english-leaning but the API falls back to keyword-style results)
 *   - POST /api/search/ai?q=...
 *   - Render answer (text) + source cards (clickable to PDF)
 *   - Persist last 5 queries in localStorage for "recent searches"
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'next-intl';

interface AiSource {
  file_id?: string;
  filename?: string;
  score?: number;
  resourceId?: string;
  title?: string | null;
  titleAr?: string | null;
  typeSlug?: string | null;
  subjectSlug?: string | null;
  classSlug?: string | null;
  teacherName?: string | null;
  pdfUrl?: string | null;
  thumbnailUrl?: string | null;
  numericId?: number | null;
  excerpt?: string;
}

interface AiResponse {
  query: string;
  answer?: string;
  sources?: AiSource[];
  total?: number;
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
        `/api/search/ai?q=${encodeURIComponent(trimmed)}`,
        { method: 'GET', headers: { Accept: 'application/json' } }
      );
      const data: AiResponse = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || `Erreur ${res.status}`);
      } else {
        setResult(data);
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
    loading: isAr ? 'جاري البحث في 14 000 مورد…' : 'Recherche dans 14 000 ressources…',
    noResult: isAr
      ? 'لا توجد نتائج. جرّب كلمات مختلفة.'
      : 'Aucun résultat. Essaie d\'autres mots-clés.',
    exampleQueries: isAr
      ? ['معادلات من الدرجة الثانية', 'قانون أوم', 'الدوال المثلثية']
      : ['équations du second degré', 'loi d\'Ohm', 'fonctions trigonométriques', 'درس الدارجة: كيفاش نحل exercice'],
    recent: isAr ? 'عمليات البحث الأخيرة' : 'Recherches récentes',
    poweredBy: isAr ? 'مدعوم بـ' : 'Propulsé par',
    open: isAr ? 'فتح' : 'Ouvrir',
    excerpt: isAr ? 'مقتطف' : 'Extrait',
    sources: isAr ? 'المصادر' : 'Sources',
    score: isAr ? 'النتيجة' : 'Score',
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
            {/* Top-level answer (concatenated excerpts) */}
            {result.answer && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  {t.sources} · {result.total}
                </h2>
                <div className="prose prose-slate max-w-none whitespace-pre-wrap text-slate-800 text-sm leading-relaxed">
                  {result.answer}
                </div>
                {result.durationMs != null && (
                  <p className="text-xs text-slate-400 mt-4">
                    {result.durationMs}ms · {result.sources?.length ?? 0} chunks
                  </p>
                )}
              </div>
            )}

            {/* Source cards */}
            {result.sources && result.sources.length > 0 && (
              <div className="grid gap-3">
                {result.sources.map((s, i) => (
                  <SourceCard key={`${s.file_id}-${i}`} source={s} locale={locale} t={t} />
                ))}
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

function SourceCard({
  source,
  locale,
  t,
}: {
  source: AiSource;
  locale: 'fr' | 'ar';
  t: any;
}) {
  const title = locale === 'ar' && source.titleAr ? source.titleAr : source.title;
  const href =
    source.resourceId && source.numericId
      ? `/${locale}/ressources/${source.numericId}/${encodeURIComponent(
          (title || source.filename || '').replace(/\s+/g, '-').toLowerCase()
        )}`
      : source.pdfUrl
      ? source.pdfUrl
      : '#';
  const score = source.score != null ? (source.score * 100).toFixed(0) : null;
  return (
    <a
      href={href}
      target={source.pdfUrl && !source.resourceId ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="block bg-white border border-slate-200 rounded-2xl p-5 hover:border-primary-300 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className="font-bold text-slate-900 line-clamp-2 mb-1">{title}</h3>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {source.subjectSlug && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">{source.subjectSlug}</span>}
            {source.classSlug && <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">{source.classSlug}</span>}
            {source.teacherName && <span>· {source.teacherName}</span>}
          </div>
        </div>
        {score != null && (
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
            {score}%
          </span>
        )}
      </div>
      {source.excerpt && (
        <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed">
          {source.excerpt}
        </p>
      )}
    </a>
  );
}

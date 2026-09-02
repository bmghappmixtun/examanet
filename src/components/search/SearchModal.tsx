'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Search,
  Loader2,
  X,
  Clock,
  TrendingUp,
  ArrowRight,
  Users,
  BookOpen,
  GraduationCap,
  FileText,
  FolderOpen,
  ChevronRight,
  Command,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { safeGetJSON, safeSetJSON, safeRemoveItem } from '@/lib/safeStorage';

type SuggestResult = {
  type: 'resource' | 'teacher' | 'subject' | 'class' | 'section';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: string;
};

type GroupedResults = {
  resource: SuggestResult[];
  teacher: SuggestResult[];
  subject: SuggestResult[];
  class: SuggestResult[];
  section: SuggestResult[];
};

const RECENT_KEY = 'examanet_recent_searches';
const MAX_RECENT = 6;

const ICON_MAP: Record<string, any> = {
  resource: FileText,
  teacher: Users,
  subject: BookOpen,
  class: GraduationCap,
  section: FolderOpen,
};

const LABEL_MAP: Record<string, string> = {
  resource: 'Ressources',
  teacher: 'Professeurs',
  subject: 'Matières',
  class: 'Classes',
  section: 'Sections',
};

const TRENDING = [
  'Mathématiques',
  'Physique',
  'SVT',
  'Français',
  'Arabe',
  'Anglais',
  'Bac',
  'Devoir',
  'Exercice',
  'Concours 9ème',
];

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export default function SearchModal({ open, onClose, initialQuery = '' }: SearchModalProps) {
  const router = useRouter();
  const t = useTranslations();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GroupedResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Mount flag (for createPortal)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load recent searches on mount
  useEffect(() => {
    const parsed = safeGetJSON<string[]>(RECENT_KEY);
    if (parsed && Array.isArray(parsed)) setRecent(parsed);
  }, []);

  // Sync query when initialQuery changes
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setActiveIndex(-1);
      // Focus input after a tick (allow render + animation)
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Clear results when closing (but keep recent)
      setResults(null);
      setActiveIndex(-1);
    }
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Save recent search
  const saveRecent = useCallback((q: string) => {
    if (!q.trim()) return;
    setRecent((prev) => {
      const updated = [q, ...prev.filter((x) => x !== q)].slice(0, MAX_RECENT);
      safeSetJSON(RECENT_KEY, updated);
      return updated;
    });
  }, []);

  // Debounced suggest
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (data.success) setResults(data.data);
      } catch (e: any) {
        if (e?.name !== 'AbortError') console.error('Suggest failed:', e);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Flatten results for keyboard nav (memoized)
  const flatResults = useMemo<SuggestResult[]>(() => {
    if (!results) return [];
    return [
      ...results.resource,
      ...results.teacher,
      ...results.subject,
      ...results.class,
      ...results.section,
    ];
  }, [results]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = query.trim();
      if (!q) return;
      saveRecent(q);
      router.push(`/recherche?q=${encodeURIComponent(q)}`);
      onClose();
    },
    [query, saveRecent, router, onClose],
  );

  const handleSelect = useCallback(
    (href: string) => {
      saveRecent(query.trim());
      router.push(href);
      onClose();
    },
    [saveRecent, query, router, onClose],
  );

  const handleRecent = useCallback(
    (q: string) => {
      setQuery(q);
      saveRecent(q);
      router.push(`/recherche?q=${encodeURIComponent(q)}`);
      onClose();
    },
    [saveRecent, router, onClose],
  );

  const clearRecent = useCallback(() => {
    setRecent([]);
    safeRemoveItem(RECENT_KEY);
  }, []);

  const clearQuery = useCallback(() => {
    setQuery('');
    setResults(null);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && flatResults[activeIndex]) {
          e.preventDefault();
          handleSelect(flatResults[activeIndex].href);
        } else {
          // Let form submit handle it
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [flatResults, activeIndex, handleSelect, onClose],
  );

  if (!mounted) return null;
  if (!open) return null;

  const hasQuery = query.trim().length >= 2;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-4 sm:pt-12 md:pt-24 px-3 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Recherche"
      onKeyDown={onKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden animate-modal-in"
      >
        {/* Search input row */}
        <form onSubmit={handleSubmit} className="relative border-b border-slate-100">
          <Search className="absolute top-1/2 -translate-y-1/2 start-5 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            className="w-full h-16 sm:h-20 ps-14 pe-24 sm:pe-28 text-base sm:text-lg bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Rechercher"
          />
          {/* Right side: clear + loading + kbd hint */}
          <div className="absolute top-1/2 -translate-y-1/2 end-4 flex items-center gap-2">
            {query && (
              <button
                type="button"
                onClick={clearQuery}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition"
                aria-label="Effacer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {loading && <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />}
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded">
              {isMac ? '⌘' : 'Ctrl'} K
            </kbd>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Results / empty state */}
        <div className="max-h-[60vh] sm:max-h-[65vh] overflow-y-auto overscroll-contain">
          {hasQuery ? (
            <ResultsPanel
              results={results}
              loading={loading}
              query={query}
              flatResults={flatResults}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onSelect={handleSelect}
              onSubmit={() => handleSubmit()}
            />
          ) : (
            <EmptyPanel
              recent={recent}
              onRecent={handleRecent}
              onClearRecent={clearRecent}
              trending={TRENDING}
              onTrending={handleRecent}
              t={t}
            />
          )}
        </div>

        {/* Footer hint */}
        <div className="hidden sm:flex items-center justify-between gap-4 px-5 py-2.5 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono font-semibold bg-white border border-slate-200 rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 font-mono font-semibold bg-white border border-slate-200 rounded">↓</kbd>
              naviguer
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono font-semibold bg-white border border-slate-200 rounded">↵</kbd>
              ouvrir
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono font-semibold bg-white border border-slate-200 rounded">Esc</kbd>
              fermer
            </span>
          </div>
          <span className="flex items-center gap-1 text-slate-400">
            <Command className="w-3 h-3" />
            recherche rapide
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/* ----- Sub components (kept in same file for cohesion) ----- */

function ResultsPanel({
  results,
  loading,
  query,
  flatResults,
  activeIndex,
  setActiveIndex,
  onSelect,
  onSubmit,
}: {
  results: GroupedResults | null;
  loading: boolean;
  query: string;
  flatResults: SuggestResult[];
  activeIndex: number;
  setActiveIndex: (n: number) => void;
  onSelect: (href: string) => void;
  onSubmit: () => void;
}) {
  if (loading && !results) {
    return (
      <div className="px-5 py-12 text-center text-sm text-slate-500">
        <Loader2 className="w-6 h-6 mx-auto mb-2 text-primary-400 animate-spin" />
        Recherche en cours…
      </div>
    );
  }

  if (!results) return null;

  if (flatResults.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="text-sm font-semibold text-slate-700">Aucun résultat pour "{query}"</p>
        <p className="text-xs text-slate-500 mt-1">Essaie avec un autre mot-clé ou une matière</p>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3">
      {(['resource', 'teacher', 'subject', 'class', 'section'] as const).map((groupKey) => {
        const group = results[groupKey];
        if (!group || group.length === 0) return null;
        const Icon = ICON_MAP[groupKey];
        return (
          <div key={groupKey} className="mb-1 last:mb-0">
            <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Icon className="w-3 h-3" />
              {LABEL_MAP[groupKey]}
              <span className="ms-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 normal-case font-semibold text-[10px]">
                {group.length}
              </span>
            </div>
            {group.map((item) => {
              const flatIdx = flatResults.indexOf(item);
              const isActive = activeIndex === flatIdx;
              return (
                <button
                  key={`${groupKey}-${item.id}`}
                  onClick={() => onSelect(item.href)}
                  onMouseEnter={() => setActiveIndex(flatIdx)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
                    isActive ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xl shrink-0 w-7 text-center">{item.icon || '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-semibold truncate text-sm ${
                        isActive ? 'text-primary-900' : 'text-slate-900'
                      }`}
                    >
                      {item.title}
                    </div>
                    {item.subtitle && (
                      <div className="text-xs text-slate-500 truncate mt-0.5">{item.subtitle}</div>
                    )}
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 shrink-0 transition ${
                      isActive ? 'text-primary-400 translate-x-0.5' : 'text-slate-300'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        );
      })}

      {/* View all results button */}
      <button
        onClick={onSubmit}
        className="w-full mt-2 px-4 py-3 rounded-lg bg-primary-50 text-primary-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary-100 transition border border-primary-100"
      >
        <Search className="w-4 h-4" />
        Voir tous les résultats pour "{query}"
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function EmptyPanel({
  recent,
  onRecent,
  onClearRecent,
  trending,
  onTrending,
  t,
}: {
  recent: string[];
  onRecent: (q: string) => void;
  onClearRecent: () => void;
  trending: string[];
  onTrending: (q: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="p-3 sm:p-4">
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent searches */}
        <div>
          <div className="px-1 py-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {t('search.recentSearches')}
            </span>
            {recent.length > 0 && (
              <button
                onClick={onClearRecent}
                className="text-[11px] text-slate-400 hover:text-slate-600 font-semibold"
              >
                {t('search.clear')}
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400 italic">Aucune recherche récente</p>
          ) : (
            <div className="space-y-0.5">
              {recent.map((q, idx) => (
                <button
                  key={`${idx}-${q}`}
                  onClick={() => onRecent(q)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2.5 group transition"
                >
                  <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary-500 transition" />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 truncate">{q}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Trending */}
        <div>
          <div className="px-1 py-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" />
              Tendances
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 px-1 py-1">
            {trending.map((term) => (
              <button
                key={term}
                onClick={() => onTrending(term)}
                className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-primary-100 hover:text-primary-700 text-xs font-semibold text-slate-700 transition"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

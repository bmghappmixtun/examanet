'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
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
const MAX_RECENT = 5;

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

const TRENDING = ['Mathématiques', 'SVT', 'Français', 'Bac', 'Devoir', 'Exercice', 'Physique'];

export default function SearchBar({
  className = '',
  size = 'md',
  initialQuery = '',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  initialQuery?: string;
}) {
  const router = useRouter();
  const t = useTranslations(); const locale = useLocale();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GroupedResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load recent searches
  useEffect(() => {
    // safeGetItem — Safari private mode + some iframe contexts throw on
    // `window.localStorage` access. safeGetJSON parses safely.
    const parsed = safeGetJSON<string[]>(RECENT_KEY);
    if (parsed && Array.isArray(parsed)) setRecent(parsed);
  }, []);

  // Sync query when initialQuery changes (e.g., URL param changes via filter)
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

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
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
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

  // Click outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    saveRecent(query.trim());
    router.push(`/recherche?q=${encodeURIComponent(query.trim())}`);
    setOpen(false);
  };

  const handleSelect = (href: string) => {
    saveRecent(query.trim());
    router.push(href);
    setOpen(false);
  };

  const handleRecent = (q: string) => {
    setQuery(q);
    router.push(`/recherche?q=${encodeURIComponent(q)}`);
    setOpen(false);
  };

  const clearRecent = () => {
    setRecent([]);
    safeRemoveItem(RECENT_KEY);
  };

  const clearQuery = () => {
    setQuery('');
    setResults(null);
    inputRef.current?.focus();
  };

  // Flatten results for keyboard nav
  const flatResults: SuggestResult[] = results
    ? [
        ...results.resource,
        ...results.teacher,
        ...results.subject,
        ...results.class,
        ...results.section,
      ]
    : [];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && flatResults[activeIndex]) {
      e.preventDefault();
      handleSelect(flatResults[activeIndex].href);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const sizeClasses = {
    sm: 'h-9 text-sm',
    md: 'h-11 text-base',
    lg: 'h-14 text-lg',
  }[size];

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search
            className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${size === 'lg' ? 'start-4 w-5 h-5' : 'start-3 w-4 h-4'}`}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            className={`w-full ${sizeClasses} ps-10 pe-10 rounded-xl border border-slate-200 bg-white focus:border-primary-400 focus:ring-4 focus:ring-primary-100 outline-none transition`}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={clearQuery}
              className="absolute top-1/2 -translate-y-1/2 end-3 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {loading && (
            <Loader2 className="absolute top-1/2 -translate-y-1/2 end-10 w-4 h-4 text-primary-500 animate-spin" />
          )}
        </div>
      </form>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full start-0 end-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-2xl z-50 max-h-[70vh] overflow-y-auto">
          {/* Query results */}
          {query.trim().length >= 2 && results && (
            <div className="p-2">
              {(['resource', 'teacher', 'subject', 'class', 'section'] as const).map((groupKey) => {
                const group = results[groupKey];
                if (!group || group.length === 0) return null;
                const Icon = ICON_MAP[groupKey];
                return (
                  <div key={groupKey} className="mb-2">
                    <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                      <Icon className="w-3 h-3" />
                      {LABEL_MAP[groupKey]} ({group.length})
                    </div>
                    {group.map((item, idx) => {
                      const flatIdx = flatResults.indexOf(item);
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelect(item.href)}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 ${activeIndex === flatIdx ? 'bg-primary-50' : 'hover:bg-slate-50'}`}
                        >
                          <span className="text-lg shrink-0">{item.icon || '📄'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 truncate text-sm">
                              {item.title}
                            </div>
                            {item.subtitle && (
                              <div className="text-xs text-slate-500 truncate">{item.subtitle}</div>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {flatResults.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-slate-500">
                  Aucun résultat pour "{query}"
                </div>
              )}

              {flatResults.length > 0 && (
                <button
                  onClick={handleSubmit}
                  className="w-full mt-2 px-3 py-2.5 rounded-lg bg-primary-50 text-primary-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary-100"
                >
                  <Search className="w-4 h-4" />
                  Voir tous les résultats pour "{query}"
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Empty state: recent + trending */}
          {query.trim().length < 2 && (
            <div className="p-2">
              {recent.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {t('search.recentSearches')}
                    </span>
                    <button
                      onClick={clearRecent}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      {t('search.clear')}
                    </button>
                  </div>
                  {recent.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleRecent(q)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm text-slate-700">{q}</span>
                    </button>
                  ))}
                </div>
              )}

              <div>
                <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" />
                  Tendances
                </div>
                <div className="flex flex-wrap gap-2 px-3 pb-2">
                  {TRENDING.map((t) => (
                    <button
                      key={t}
                      onClick={() => handleRecent(t)}
                      className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

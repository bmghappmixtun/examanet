'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import {
  Search,
  Filter,
  X,
  Grid,
  List,
  Loader2,
  Eye,
  Download,
  Calendar,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  GraduationCap,
  Languages,
  FileCheck2,
  Sparkles,
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { SearchResponse, SearchResult } from '@/lib/search-v2-d1';

const TYPE_LABELS: Record<string, string> = {
  COURSE: 'Cours',
  DEVOIR: 'Devoir',
  EXERCISE: 'Exercice',
  EXERCISES: 'Exercices',
  SERIES: 'Série',
  BAC_SUBJECT: 'Sujet Bac',
  CORRECTION: 'Corrigé',
  SUMMARY: 'Résumé',
  CARD: 'Fiche',
  OTHER: 'Autre',
};

const TYPE_COLORS: Record<string, string> = {
  COURSE: 'bg-blue-100 text-blue-700',
  DEVOIR: 'bg-amber-100 text-amber-700',
  EXERCISE: 'bg-purple-100 text-purple-700',
  EXERCISES: 'bg-purple-100 text-purple-700',
  SERIES: 'bg-emerald-100 text-emerald-700',
  BAC_SUBJECT: 'bg-red-100 text-red-700',
  CORRECTION: 'bg-green-100 text-green-700',
  SUMMARY: 'bg-slate-100 text-slate-700',
  CARD: 'bg-pink-100 text-pink-700',
  OTHER: 'bg-slate-100 text-slate-600',
};

const TRIMESTER_LABELS: Record<string, string> = {
  T1: 'Trimestre 1',
  T2: 'Trimestre 2',
  T3: 'Trimestre 3',
};

const LANGUAGE_LABELS: Record<string, string> = {
  fr: '🇫🇷 Français',
  ar: '🇹🇳 العربية',
  en: '🇬🇧 English',
  it: '🇮🇹 Italiano',
  de: '🇩🇪 Deutsch',
  es: '🇪🇸 Español',
};

interface Props {
  initialData: SearchResponse;
  options: {
    subjects: {
      id: string;
      nameFr: string;
      slug: string;
      color: string | null;
      icon: string | null;
      count: number;
    }[];
    classes: { id: string; nameFr: string; slug: string; count: number }[];
    sections: { id: string; nameFr: string; slug: string; classId: string; count: number }[];
    teachers: { id: string; name: string }[];
    types: { value: string; count: number }[];
    years: { value: string; count: number }[];
    trimestres: { value: string; count: number }[];
    languages: { value: string; count: number }[];
  };
}

export default function SearchResultsV2({ initialData, options }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<SearchResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Current filter state
  const currentQ = searchParams.get('q') || '';
  const currentSort = searchParams.get('sort') || 'relevance';
  const currentPage = parseInt(searchParams.get('page') || '1');
  const filters = {
    subject: searchParams.getAll('subject'),
    class: searchParams.getAll('class'),
    section: searchParams.getAll('section'),
    type: searchParams.getAll('type'),
    year: searchParams.getAll('year'),
    trimester: searchParams.getAll('trimestre'),
    language: searchParams.getAll('language'),
    hasCorrection: searchParams.get('hasCorrection') === 'true' ? true : undefined,
  };

  // Update URL
  const updateUrl = useCallback(
    (updates: Record<string, string | string[] | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (
          value === null ||
          value === undefined ||
          value === '' ||
          (Array.isArray(value) && value.length === 0)
        ) {
          params.delete(key);
        } else if (Array.isArray(value)) {
          params.delete(key);
          value.forEach((v) => params.append(key, v));
        } else {
          params.set(key, value);
        }
      });
      router.push(`/recherche?${params.toString()}`);
    },
    [searchParams, router],
  );

  const clearAll = () => {
    const p = new URLSearchParams();
    if (currentQ) p.set('q', currentQ);
    router.push(`/recherche${p.toString() ? '?' + p.toString() : ''}`);
  };

  const toggleFilter = (
    key: 'subject' | 'class' | 'section' | 'type' | 'year' | 'trimester' | 'language',
    value: string,
  ) => {
    const current = filters[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    updateUrl({ [key]: next, page: null });
  };

  const setHasCorrection = (val: boolean | undefined) => {
    updateUrl({ hasCorrection: val === true ? 'true' : null, page: null });
  };

  const setSort = (sort: string) => updateUrl({ sort, page: null });

  const setPage = (p: number) => updateUrl({ page: String(p) });

  // Refetch when URL changes
  const searchString = searchParams.toString();
  useEffect(() => {
    // Skip first render (initialData from SSR)
    if (
      searchString === new URLSearchParams(window.location.search.slice(1)).toString() &&
      data.query === currentQ
    ) {
      // Already loaded
    }
    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/search/v2?${searchString}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setData(d);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error('Search refetch:', e);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [searchString]);

  const activeFiltersCount = Object.entries(filters).reduce((acc, [k, v]) => {
    if (Array.isArray(v)) return acc + v.length;
    if (v === true) return acc + 1;
    return acc;
  }, 0);

  // Sections for the active class filter
  const activeSections = options.sections.filter(
    (s) => filters.class.length === 0 || filters.class.includes(s.classId),
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {currentQ ? (
              <>
                Résultats pour <span className="text-primary-600">"{currentQ}"</span>
              </>
            ) : (
              <>Toutes les ressources</>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-bold text-slate-900">{formatNumber(data.total)}</span> ressources
            {data.durationMs ? <> · {data.durationMs}ms</> : null}
            {data.synonymsApplied?.length ? (
              <span className="ms-2 inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-xs">
                <Sparkles className="w-3 h-3" />
                {data.synonymsApplied.length} synonyme{data.synonymsApplied.length > 1 ? 's' : ''}{' '}
                appliqué{data.synonymsApplied.length > 1 ? 's' : ''}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((s) => !s)}
            className="lg:hidden flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 bg-white"
          >
            <Filter className="w-4 h-4" />
            Filtres
            {activeFiltersCount > 0 && (
              <span className="px-1.5 bg-primary-600 text-white text-xs rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <select
            value={currentSort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold bg-white"
          >
            <option value="relevance">Pertinence</option>
            <option value="recent">Plus récent</option>
            <option value="popular">Plus vus</option>
            <option value="downloads">Plus téléchargés</option>
          </select>

          <div className="hidden sm:flex border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-primary-50 text-primary-600' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Grille"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-primary-50 text-primary-600' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Liste"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar filters */}
        <aside className={`${showFilters ? 'block' : 'hidden'} lg:block space-y-4`}>
          {/* Type */}
          <FilterSection title="Type" icon={<BookOpen className="w-4 h-4" />}>
            {options.types.map((t) => (
              <FilterChip
                key={t.value}
                label={TYPE_LABELS[t.value] || t.value}
                count={t.count}
                active={filters.type.includes(t.value)}
                onClick={() => toggleFilter('type', t.value)}
                color={TYPE_COLORS[t.value]}
              />
            ))}
          </FilterSection>

          {/* Subject */}
          <FilterSection title="Matière" icon={<GraduationCap className="w-4 h-4" />}>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {options.subjects
                .filter((s) => s.count > 0)
                .map((s) => (
                  <FilterChip
                    key={s.slug}
                    label={s.nameFr}
                    count={s.count}
                    active={filters.subject.includes(s.slug)}
                    onClick={() => toggleFilter('subject', s.slug)}
                    color={
                      s.color
                        ? `bg-[${s.color}]/10 text-[${s.color}]`
                        : 'bg-slate-100 text-slate-700'
                    }
                    icon={s.icon || undefined}
                  />
                ))}
            </div>
          </FilterSection>

          {/* Class */}
          <FilterSection title="Classe" icon={<GraduationCap className="w-4 h-4" />}>
            {options.classes
              .filter((c) => c.count > 0)
              .map((c) => (
                <FilterChip
                  key={c.slug}
                  label={c.nameFr}
                  count={c.count}
                  active={filters.class.includes(c.slug)}
                  onClick={() => toggleFilter('class', c.slug)}
                />
              ))}
          </FilterSection>

          {/* Section (only if class is filtered or all) */}
          {activeSections.length > 0 && (
            <FilterSection title="Section" icon={<Filter className="w-4 h-4" />}>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {activeSections
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <FilterChip
                      key={s.slug}
                      label={s.nameFr}
                      count={s.count}
                      active={filters.section.includes(s.slug)}
                      onClick={() => toggleFilter('section', s.slug)}
                    />
                  ))}
              </div>
            </FilterSection>
          )}

          {/* Year */}
          {options.years.length > 0 && (
            <FilterSection title="Année scolaire" icon={<Calendar className="w-4 h-4" />}>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {options.years.slice(0, 15).map((y) => (
                  <FilterChip
                    key={y.value}
                    label={y.value}
                    count={y.count}
                    active={filters.year.includes(y.value)}
                    onClick={() => toggleFilter('year', y.value)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {/* Trimestre */}
          {options.trimestres.length > 0 && (
            <FilterSection title="Trimestre" icon={<Calendar className="w-4 h-4" />}>
              {options.trimestres.map((t) => (
                <FilterChip
                  key={t.value}
                  label={TRIMESTER_LABELS[t.value] || t.value}
                  count={t.count}
                  active={filters.trimester.includes(t.value)}
                  onClick={() => toggleFilter('trimester', t.value)}
                />
              ))}
            </FilterSection>
          )}

          {/* Language */}
          {options.languages.length > 0 && (
            <FilterSection title="Langue" icon={<Languages className="w-4 h-4" />}>
              {options.languages.map((l) => (
                <FilterChip
                  key={l.value}
                  label={LANGUAGE_LABELS[l.value] || l.value}
                  count={l.count}
                  active={filters.language.includes(l.value)}
                  onClick={() => toggleFilter('language', l.value)}
                />
              ))}
            </FilterSection>
          )}

          {/* Has correction */}
          <FilterSection title="Avec corrigé" icon={<FileCheck2 className="w-4 h-4" />}>
            <button
              onClick={() => setHasCorrection(filters.hasCorrection ? undefined : true)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition ${
                filters.hasCorrection
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Corrigé inclus
              </span>
              <span className="text-xs">{data.facets.hasCorrection}</span>
            </button>
          </FilterSection>

          {/* Active filter chips + clear */}
          {activeFiltersCount > 0 && (
            <div className="pt-2 border-t">
              <button
                onClick={clearAll}
                className="w-full text-sm text-rose-600 hover:text-rose-700 font-medium py-2"
              >
                Réinitialiser ({activeFiltersCount})
              </button>
            </div>
          )}
        </aside>

        {/* Results */}
        <main className="min-w-0">
          {/* Active filter chips */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {filters.subject.map((v) => (
                <ActiveChip
                  key={`s-${v}`}
                  label={options.subjects.find((s) => s.slug === v)?.nameFr || v}
                  onRemove={() => toggleFilter('subject', v)}
                />
              ))}
              {filters.class.map((v) => (
                <ActiveChip
                  key={`c-${v}`}
                  label={options.classes.find((c) => c.slug === v)?.nameFr || v}
                  onRemove={() => toggleFilter('class', v)}
                />
              ))}
              {filters.section.map((v) => (
                <ActiveChip
                  key={`sec-${v}`}
                  label={options.sections.find((s) => s.slug === v)?.nameFr || v}
                  onRemove={() => toggleFilter('section', v)}
                />
              ))}
              {filters.type.map((v) => (
                <ActiveChip
                  key={`t-${v}`}
                  label={TYPE_LABELS[v] || v}
                  onRemove={() => toggleFilter('type', v)}
                />
              ))}
              {filters.year.map((v) => (
                <ActiveChip key={`y-${v}`} label={v} onRemove={() => toggleFilter('year', v)} />
              ))}
              {filters.trimester.map((v) => (
                <ActiveChip
                  key={`tr-${v}`}
                  label={TRIMESTER_LABELS[v] || v}
                  onRemove={() => toggleFilter('trimester', v)}
                />
              ))}
              {filters.language.map((v) => (
                <ActiveChip
                  key={`l-${v}`}
                  label={LANGUAGE_LABELS[v] || v}
                  onRemove={() => toggleFilter('language', v)}
                />
              ))}
              {filters.hasCorrection && (
                <ActiveChip label="Avec corrigé" onRemove={() => setHasCorrection(undefined)} />
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Mise à jour...
            </div>
          )}

          {/* Results list */}
          {data.results.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center">
              <Search className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium">Aucun résultat trouvé</p>
              {currentQ && (
                <p className="text-sm text-slate-500 mt-1">
                  Essayez d'autres mots-clés ou modifiez les filtres
                </p>
              )}
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'
                  : 'space-y-3'
              }
            >
              {data.results.map((r) => (
                <ResultCard key={r.id} r={r} viewMode={viewMode} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {paginationRange(currentPage, data.totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={i} className="px-2 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      p === currentPage
                        ? 'bg-primary-600 text-white'
                        : 'border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= data.totalPages}
                className="px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function FilterSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  color,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
  icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-sm transition ${
        active
          ? (color || 'bg-primary-100 text-primary-700') + ' font-semibold'
          : 'hover:bg-slate-100 text-slate-700'
      }`}
    >
      <span className="flex items-center gap-1.5 truncate">
        {icon ? <span>{icon}</span> : null}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded min-w-[24px] text-center ${
          active ? 'bg-white/50' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {formatNumber(count)}
      </span>
    </button>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-primary-100 text-primary-700 px-2.5 py-1 rounded-full text-xs font-medium">
      {label}
      <button onClick={onRemove} className="hover:bg-primary-200 rounded-full p-0.5">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function ResultCard({ r, viewMode }: { r: SearchResult; viewMode: 'grid' | 'list' }) {
  const typeColor = TYPE_COLORS[r.type || 'OTHER'] || 'bg-slate-100 text-slate-600';
  // Build the href with proper URL encoding for slugs with special chars (Arabic, accents, etc.)
  // The numericId is the stable identifier; the slug is cosmetic.
  // encodeURIComponent ensures the slug is properly escaped for the URL.
  // Fallback: use 'no-slug' if empty so the route always matches (handler tolerates it).
  const slug = r.slug || 'no-slug';
  const href = r.numericId
    ? `/ressources/${r.numericId}/${encodeURIComponent(slug)}`
    : '#';

  if (viewMode === 'list') {
    return (
      <Link
        href={href}
        className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition group"
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex-shrink-0 w-12 h-12 rounded-lg ${typeColor} flex items-center justify-center text-xl font-bold`}
          >
            {r.type?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="font-semibold text-slate-900 group-hover:text-primary-600 line-clamp-2"
              dangerouslySetInnerHTML={{ __html: r.titleHighlighted || r.title || '' }}
            />
            {r.descriptionHighlighted && (
              <p
                className="text-sm text-slate-600 mt-1 line-clamp-2"
                dangerouslySetInnerHTML={{ __html: r.descriptionHighlighted }}
              />
            )}
            <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
              {r.type && (
                <span className={`px-2 py-0.5 rounded ${typeColor}`}>
                  {TYPE_LABELS[r.type] || r.type}
                </span>
              )}
              {r.subject && (
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  {r.subject.nameFr}
                </span>
              )}
              {r.class && (
                <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                  {r.class.nameFr}
                </span>
              )}
              {r.section && (
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {r.section.nameFr}
                </span>
              )}
              {r.year && (
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{r.year}</span>
              )}
              {r.hasCorrection && (
                <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">✓ Corrigé</span>
              )}
              {r.language && (
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {r.language.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 text-right text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <Eye className="w-3 h-3" /> {formatNumber(r.viewsCount || 0)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Download className="w-3 h-3" /> {formatNumber(r.downloadsCount || 0)}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition group h-full flex flex-col"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${typeColor}`}>
          {TYPE_LABELS[r.type || 'OTHER'] || r.type}
        </span>
        {r.hasCorrection && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
      </div>
      <h3
        className="font-semibold text-slate-900 group-hover:text-primary-600 line-clamp-2 mb-1 text-sm"
        dangerouslySetInnerHTML={{ __html: r.titleHighlighted || r.title || '' }}
      />
      {r.descriptionHighlighted && (
        <p
          className="text-xs text-slate-600 line-clamp-2 mb-2 flex-1"
          dangerouslySetInnerHTML={{ __html: r.descriptionHighlighted }}
        />
      )}
      <div className="flex flex-wrap gap-1 text-xs">
        {r.subject && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
            {r.subject.nameFr}
          </span>
        )}
        {r.class && (
          <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
            {r.class.nameFr}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-slate-500">
        <div className="flex items-center gap-2">
          {r.year && <span>{r.year}</span>}
          {r.trimester && <span>· {r.trimester}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Eye className="w-3 h-3" /> {formatNumber(r.viewsCount || 0)}
        </div>
      </div>
    </Link>
  );
}

// ============================================================================
// Pagination
// ============================================================================
function paginationRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

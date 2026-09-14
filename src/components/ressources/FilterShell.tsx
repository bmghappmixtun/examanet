'use client';

import {
  useQueryStates,
  parseAsString,
  parseAsArrayOf,
  parseAsInteger,
  parseAsStringEnum,
  parseAsBoolean,
} from 'nuqs';
import { useState, useEffect, useTransition, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  X,
  ChevronDown,
  SlidersHorizontal,
  Check,
  BookOpen,
  GraduationCap,
  Calendar,
  Languages,
  FileText,
  CheckCircle2,
  ArrowUpDown,
  LayoutGrid,
  List,
  RotateCcw,
  Loader2,
  Sparkles,
  Filter as FilterIcon,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
// BUGFIX 2026-08-09: removed the @radix-ui/react-switch import. The
// Switch.Root inside CategorySwitch + hasCorrection was firing its
// `onCheckedChange` handler on top of the parent <button> onClick,
// causing a double-toggle that cancelled itself out (filter state
// never actually changed, so the auto-update never fired).
// Replaced Switch.Root with a pure visual span (no event handlers).
// If we later need keyboard-toggleable a11y on these switches, we
// can re-introduce a single, well-placed Switch.
import type { LucideIcon } from 'lucide-react';
import { useRouter, usePathname } from '@/i18n/navigation';
import ResourceCard from '@/components/resources/ResourceCard';
import ResourceListItem from '@/components/resources/ResourceListItem';

// ============== TYPES ==============
import type { RessourcesResponse } from '@/lib/facets';

export type { Facets } from '@/lib/facets';

interface FilterShellProps {
  initialData?: RessourcesResponse;
  userId: string | null;
  /**
   * Array (NOT Set) of resource IDs the current user has favorited.
   *
   * Why string[] instead of Set<string>:
   *   The previous version took a `Set<string>` directly. The set was built
   *   on the server (`getUserFavorites()`) and passed across the RSC
   *   boundary into this client component. While the RSC payload format
   *   supports `Set` in theory, in practice the deserialized value on
   *   the client could be a plain `{}` object for empty sets, which made
   *   `favorites.has(r.id)` throw `TypeError: favorites.has is not a function`
   *   during the first client render. That error fired inside the resource
   *   list render and surfaced as React #418 / #422 (Minified React errors
   *   for hydration mismatch) on /ressources and /ar/ressources?teacherId=*
   *   (ERR-FDLWSW, ERR-9NC4YW, ERR-PMURPC, ERR-VSZUDD in the 2026-07-30
   *   nightly digest — 12 events).
   *
   *   Arrays serialize trivially over RSC. We convert to a Set on the
   *   client for O(1) `has()` lookups in the resources list.
   */
  initialFavorites: string[];
}

type ApiResponse = FilterShellProps['initialData'];

// ============== RESOURCE TYPE / TRIMESTRE / LANGUAGE / YEAR META ==============
const TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  COURSE: { label: 'Cours', emoji: '📘', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  DEVOIR: { label: 'Devoir', emoji: '📝', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  EXERCISE: {
    label: 'Exercice',
    emoji: '📊',
    color: 'bg-green-100 text-green-700 border-green-200',
  },
  REVISION: {
    label: 'Révision',
    emoji: '🔄',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  EXAM: { label: 'Examen', emoji: '📃', color: 'bg-red-100 text-red-700 border-red-200' },
  BAC_SUBJECT: {
    label: 'Sujet Bac',
    emoji: '🎯',
    color: 'bg-pink-100 text-pink-700 border-pink-200',
  },
  CORRECTION: {
    label: 'Corrigé',
    emoji: '✅',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  SUMMARY: {
    label: 'Résumé',
    emoji: '📋',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
  OTHER: { label: 'Autre', emoji: '📦', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const TRIMESTRE_META: Record<string, { label: string; emoji: string }> = {
  '1': { label: 'Trimestre 1', emoji: '1️⃣' },
  '2': { label: 'Trimestre 2', emoji: '2️⃣' },
  '3': { label: 'Trimestre 3', emoji: '3️⃣' },
};

const LANGUAGE_META: Record<string, { label: string; flag: string }> = {
  fr: { label: 'Français', flag: '🇫🇷' },
  ar: { label: 'Arabe', flag: '🇹🇳' },
  en: { label: 'Anglais', flag: '🇬🇧' },
  it: { label: 'Italien', flag: '🇮🇹' },
  de: { label: 'Allemand', flag: '🇩🇪' },
  es: { label: 'Espagnol', flag: '🇪🇸' },
};

const SORT_META: Record<string, string> = {
  recent: 'Plus récent',
  popular: 'Plus consulté',
  downloads: 'Plus téléchargé',
  rating: 'Mieux noté',
  oldest: 'Plus ancien',
};

// ============== HELPERS ==============
const empty = (s: string | null | undefined) => !s || s === '' || s === '[]';

// ============== MAIN COMPONENT ==============
export default function FilterShell({ initialData, userId, initialFavorites }: FilterShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // ============== URL STATE (single source of truth) ==============
  const [filters, setFilters] = useQueryStates({
    q: parseAsString.withDefault(''),
    type: parseAsArrayOf(parseAsString).withDefault([]),
    class: parseAsArrayOf(parseAsString).withDefault([]),
    section: parseAsArrayOf(parseAsString).withDefault([]),
    subject: parseAsArrayOf(parseAsString).withDefault([]),
    trimestre: parseAsArrayOf(parseAsString).withDefault([]),
    year: parseAsArrayOf(parseAsString).withDefault([]),
    language: parseAsArrayOf(parseAsString).withDefault([]),
    hasCorrection: parseAsBoolean.withDefault(false),
    collegePilote: parseAsBoolean.withDefault(false),
    collegeOrdinaire: parseAsBoolean.withDefault(false),
    lyceePilote: parseAsBoolean.withDefault(false),
    lyceeOrdinaire: parseAsBoolean.withDefault(false),
    teacherId: parseAsString.withDefault(''),
    sort: parseAsStringEnum(['recent', 'popular', 'downloads', 'rating', 'oldest']).withDefault(
      'recent',
    ),
    page: parseAsInteger.withDefault(1),
    view: parseAsStringEnum(['grid', 'list']).withDefault('grid'),
  });

  // ============== DATA (server initial → client-refetched) ==============
  // When no SSR initialData is provided, the page is purely client-rendered
  // (used for CF Workers where the SSR data fetch throws 1101 on filtered URLs).
  const emptyData: ApiResponse = { resources: [], total: 0, totalPages: 0, currentPage: 1, facets: { byType: {}, byTrimestre: {}, byYear: {}, byLanguage: {}, byClass: {}, bySection: {}, bySubject: {}, withCorrection: 0, collegePilote: 0, collegeOrdinaire: 0, lyceePilote: 0, lyceeOrdinaire: 0 }, nameMaps: { class: {}, section: {}, subject: {} } };
  const [data, setData] = useState<ApiResponse>(initialData || emptyData);
  // Convert the array prop to a Set once on mount for O(1) `has()` lookups.
  // We keep the source-of-truth as the array prop (safe across RSC) and
  // memoize the Set so it doesn't rebuild on every render.
  const favorites = useMemo(() => new Set(initialFavorites), [initialFavorites]);
  const [isFetching, setIsFetching] = useState(false);
  const lastFetchKey = useRef<string>('');

  // Compute a stable key for current filters (used to dedupe fetches)
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        q: filters.q,
        type: [...filters.type].sort(),
        class: [...filters.class].sort(),
        section: [...filters.section].sort(),
        subject: [...filters.subject].sort(),
        trimestre: [...filters.trimestre].sort(),
        year: [...filters.year].sort(),
        language: [...filters.language].sort(),
        hasCorrection: filters.hasCorrection,
        collegePilote: filters.collegePilote,
        collegeOrdinaire: filters.collegeOrdinaire,
        lyceePilote: filters.lyceePilote,
        lyceeOrdinaire: filters.lyceeOrdinaire,
        teacherId: filters.teacherId,
        sort: filters.sort,
        page: filters.page,
      }),
    [filters],
  );

  // Compute the key the initial SSR data was loaded with so we can
  // skip the first client refetch when filters haven't actually changed.
  // Prevents "resources appear, then disappear" race on first paint.
  // `filters` at first render matches the URL → matches the SSR data.
  // So if the current filterKey === first render filterKey, we can trust
  // initialData and skip the refetch.
  const isFirstRender = useRef(true);
  const firstRenderKey = useRef('');
  if (isFirstRender.current && !firstRenderKey.current) {
    firstRenderKey.current = filterKey;
  }

  // ============== FETCH ON FILTER CHANGE (debounced) ==============
  // BUGFIX 2026-08-09 (FINAL): the dependency array was `[filterKey, filters]`
  // which caused the effect to re-fire on every render — `filters` is a new
  // object reference from useQueryStates on every render, even when the
  // underlying values are identical. The cleanup of each effect run was
  // calling `clearTimeout(t)`, so the 80ms debounced fetch was cancelled
  // before it could fire. The user saw the page NOT update on filter click.
  //
  // Fix: depend ONLY on `filterKey` (the memoized string). Read the latest
  // `filters` value via a ref so we always build the URL with the freshest
  // data without re-triggering the effect.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useEffect(() => {
    // Skip the initial fetch on first render if the SSR data already
    // matches the current filter key (prevents the brief "resources
    // appear then disappear" race when the page first hydrates).
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Skip the initial fetch only if SSR initialData was provided
      // AND the current filters match what was server-rendered
      if (initialData && filterKey === firstRenderKey.current) {
        lastFetchKey.current = filterKey;
        return;
      }
    }

    if (lastFetchKey.current === filterKey) return;
    lastFetchKey.current = filterKey;

    const controller = new AbortController();
    const DEBOUNCE_MS = 80;
    setIsFetching(true);
    const t = setTimeout(async () => {
      try {
        // Read the latest filters from the ref so the URL we build
        // matches the user's most recent click, even if the effect
        // was scheduled by a slightly older snapshot.
        const f = filtersRef.current;
        const params = new URLSearchParams();
        if (f.q) params.set('q', f.q);
        f.type.forEach((v) => params.append('type', v));
        f.class.forEach((v) => params.append('class', v));
        f.section.forEach((v) => params.append('section', v));
        f.subject.forEach((v) => params.append('subject', v));
        f.trimestre.forEach((v) => params.append('trimestre', v));
        f.year.forEach((v) => params.append('year', v));
        f.language.forEach((v) => params.append('language', v));
        if (f.hasCorrection) params.set('hasCorrection', '1');
        if (f.collegePilote) params.set('collegePilote', '1');
        if (f.collegeOrdinaire) params.set('collegeOrdinaire', '1');
        if (f.lyceePilote) params.set('lyceePilote', '1');
        if (f.lyceeOrdinaire) params.set('lyceeOrdinaire', '1');
        if (f.teacherId) params.set('teacherId', f.teacherId);
        params.set('sort', f.sort);
        params.set('page', String(f.page));

        const url = `/api/ressources-data?${params.toString()}`;
        const res = await fetch(url, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        setData(json);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[FilterShell] fetch error:', err);
      } finally {
        setIsFetching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      controller.abort();
      setIsFetching(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // ============== MUTATIONS ==============
  const update = useCallback(
    (patch: Record<string, unknown>) => {
      // Any filter change resets page to 1
      const next: Record<string, unknown> = { ...patch };
      if (!('page' in patch)) next.page = 1;
      startTransition(() => {
        void setFilters(next as any);
      });
    },
    [setFilters],
  );

  const reset = useCallback(() => {
    startTransition(() => {
      void setFilters({
        q: '',
        type: [],
        class: [],
        section: [],
        subject: [],
        trimestre: [],
        year: [],
        language: [],
        hasCorrection: false,
        collegePilote: false,
        collegeOrdinaire: false,
        lyceePilote: false,
        lyceeOrdinaire: false,
        teacherId: '',
        sort: 'recent',
        page: 1,
        view: filters.view,
      } as any);
    });
  }, [setFilters, filters.view]);

  const toggleMulti = (
    key: 'type' | 'class' | 'section' | 'subject' | 'trimestre' | 'year' | 'language',
    value: string,
  ) => {
    const current = filters[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    update({ [key]: next });
  };

  const activeCount =
    (filters.q ? 1 : 0) +
    filters.type.length +
    filters.class.length +
    filters.section.length +
    filters.subject.length +
    filters.trimestre.length +
    filters.year.length +
    filters.language.length +
    (filters.hasCorrection ? 1 : 0) +
    (filters.collegePilote ? 1 : 0) +
    (filters.collegeOrdinaire ? 1 : 0) +
    (filters.lyceePilote ? 1 : 0) +
    (filters.lyceeOrdinaire ? 1 : 0);

  // ============== FACET OPTIONS (only those with count > 0) ==============
  const yearOptions = useMemo(
    () => Object.entries(data.facets.byYear).sort(([a], [b]) => b.localeCompare(a)),
    [data.facets.byYear],
  );
  const subjectOptions = useMemo(
    () => Object.entries(data.facets.bySubject).sort(([, a], [, b]) => b - a),
    [data.facets.bySubject],
  );
  const classOptions = useMemo(
    () => Object.entries(data.facets.byClass).sort(([, a], [, b]) => b - a),
    [data.facets.byClass],
  );
  const sectionOptions = useMemo(
    () => Object.entries(data.facets.bySection).sort(([, a], [, b]) => b - a),
    [data.facets.bySection],
  );

  // Filter sections to only those matching selected classes
  const availableSections = useMemo(() => {
    if (filters.class.length === 0) return sectionOptions;
    // We need class->sections mapping. For now just show all sections;
    // the server's facet count already respects class filter.
    return sectionOptions;
  }, [sectionOptions, filters.class]);

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-6">
      {/* ============== SIDEBAR FILTERS ============== */}
      <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm h-fit lg:sticky lg:top-24 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-sm flex items-center gap-2 text-slate-900">
            <SlidersHorizontal className="w-4 h-4 text-primary-600" />
            <span>Filtres</span>
            {/*
             * Always render the activeCount badge, even when 0. The badge is
             * hidden via CSS when activeCount === 0 (display: none) so the
             * DOM structure stays identical between server and client, which
             * prevents React #418/#422 hydration mismatches when the Suspense
             * fallback (loading.tsx) is patched against the streamed page.
             * The activeCount itself is derived from useQueryStates (URL-based)
             * and is stable between server and client, so hiding the badge
             * with CSS rather than conditionally rendering it is safe.
             */}
            <span
              className={`ms-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-600 text-white text-[10px] font-bold ${activeCount > 0 ? '' : 'hidden'}`}
              aria-hidden={activeCount === 0}
            >
              {activeCount}
            </span>
          </h3>
          {/*
           * Always render the Reset button. Hidden via CSS when activeCount === 0
           * so the parent div's child count stays constant.
           */}
          <button
            type="button"
            onClick={reset}
            className={`text-xs text-slate-500 hover:text-red-600 font-semibold flex items-center gap-1 transition ${activeCount > 0 ? '' : 'hidden'}`}
            aria-hidden={activeCount === 0}
            tabIndex={activeCount > 0 ? 0 : -1}
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>

        <div className="max-h-[calc(100vh-180px)] overflow-y-auto px-5 py-4 space-y-5">
          {/* ----- RECHERCHE ----- */}
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Recherche
            </div>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={filters.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Mots-clés..."
                className="w-full ps-9 pe-9 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-200 focus:border-primary-400 focus:bg-white outline-none transition"
              />
              {filters.q && (
                <button
                  onClick={() => update({ q: '' })}
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  aria-label="Effacer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* ----- TYPE -----
           * Always render the section, hide via CSS when there are no options.
           * Mirrors the "always render, hide via CSS" pattern used elsewhere
           * in this file (chips wrapper, results, pagination) — keeps the
           * sidebar's child count stable between the loading.tsx skeleton
           * and the streamed page, preventing React #418/#422 hydration
           * mismatches when filter sections appear/disappear based on the
           * current facet data (e.g. ?subject=anglais shows all 8 sections,
           * but ?type=HOMEWORK (0 results) might show only 2).
           * (2026-08-05: ERR-SGFVDH 5x, ERR-XCZNW4 5x on /ressources?subject=anglais&...) */}
          <div className={Object.keys(data.facets.byType).length > 0 ? '' : 'hidden'} aria-hidden={Object.keys(data.facets.byType).length === 0}>
            <MultiSelectChips
              label="Type de ressource"
              icon={FileText}
              options={Object.entries(data.facets.byType)
                .sort(([, a], [, b]) => b - a)
                .map(([value, count]) => ({
                  value,
                  // FIX 2026-09-14: fallback to a friendly label for unknown types
                  // (after migration 0023, no duplicates should appear here).
                  // If a new unknown type ever shows up, log it once so we can investigate.
                  label: TYPE_META[value]?.label || (() => {
                    if (typeof window !== 'undefined' && !(window as any).__unknownTypeLogged?.[value]) {
                      (window as any).__unknownTypeLogged = { ...((window as any).__unknownTypeLogged || {}), [value]: true };
                      console.warn(`[ressources] Unknown Resource.type: ${value} (count=${count}). Add to TYPE_META or migrate to canonical value.`);
                    }
                    return value; // show raw value so admins can identify it
                  })(),
                  emoji: TYPE_META[value]?.emoji,
                  color: TYPE_META[value]?.color,
                  count,
                }))}
              selected={filters.type}
              onToggle={(v) => toggleMulti('type', v)}
            />
          </div>

          {/* ----- MATIÈRE ----- */}
          <div className={subjectOptions.length > 0 ? '' : 'hidden'} aria-hidden={subjectOptions.length === 0}>
            <MultiSelectChips
              label="Matière"
              icon={BookOpen}
              options={subjectOptions.map(([slug, count]) => ({
                value: slug,
                label: data.nameMaps?.subject?.[slug] || slug,
                count,
              }))}
              selected={filters.subject}
              onToggle={(v) => toggleMulti('subject', v)}
            />
          </div>

          {/* ----- CLASSE ----- */}
          <div className={classOptions.length > 0 ? '' : 'hidden'} aria-hidden={classOptions.length === 0}>
            <MultiSelectChips
              label="Classe"
              icon={GraduationCap}
              options={classOptions.map(([slug, count]) => ({
                value: slug,
                label: data.nameMaps?.class?.[slug] || slug,
                count,
              }))}
              selected={filters.class}
              onToggle={(v) => toggleMulti('class', v)}
            />
          </div>

          {/* ----- SECTION (only if classes selected OR sections exist) ----- */}
          <div className={availableSections.length > 0 ? '' : 'hidden'} aria-hidden={availableSections.length === 0}>
            <MultiSelectChips
              label="Section"
              icon={FilterIcon}
              options={availableSections.map(([slug, count]) => ({
                value: slug,
                label: data.nameMaps?.section?.[slug] || slug,
                count,
              }))}
              selected={filters.section}
              onToggle={(v) => toggleMulti('section', v)}
            />
          </div>

          {/* ----- ANNÉE SCOLAIRE ----- */}
          <div className={yearOptions.length > 0 ? '' : 'hidden'} aria-hidden={yearOptions.length === 0}>
            <MultiSelectChips
              label="Année scolaire"
              icon={Calendar}
              options={yearOptions.map(([year, count]) => ({
                value: year,
                label: year,
                count,
              }))}
              selected={filters.year}
              onToggle={(v) => toggleMulti('year', v)}
            />
          </div>

          {/* ----- TRIMESTRE ----- */}
          <div className={Object.keys(data.facets.byTrimestre).length > 0 ? '' : 'hidden'} aria-hidden={Object.keys(data.facets.byTrimestre).length === 0}>
            <MultiSelectChips
              label="Trimestre"
              icon={Sparkles}
              options={Object.entries(data.facets.byTrimestre)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([value, count]) => ({
                  value,
                  label: TRIMESTRE_META[value]?.label || `Trim. ${value}`,
                  emoji: TRIMESTRE_META[value]?.emoji,
                  count,
                }))}
              selected={filters.trimestre}
              onToggle={(v) => toggleMulti('trimestre', v)}
            />
          </div>

          {/* ----- LANGUE ----- */}
          <div className={Object.keys(data.facets.byLanguage).length > 1 ? '' : 'hidden'} aria-hidden={Object.keys(data.facets.byLanguage).length <= 1}>
            <MultiSelectChips
              label="Langue"
              icon={Languages}
              options={Object.entries(data.facets.byLanguage)
                .sort(([, a], [, b]) => b - a)
                .map(([value, count]) => ({
                  value,
                  label: LANGUAGE_META[value]?.label || value.toUpperCase(),
                  emoji: LANGUAGE_META[value]?.flag,
                  count,
                }))}
              selected={filters.language}
              onToggle={(v) => toggleMulti('language', v)}
            />
          </div>

          {/* ----- AVEC CORRIGÉ ----- */}
          <div className={data.facets.withCorrection > 0 ? '' : 'hidden'} aria-hidden={data.facets.withCorrection === 0}>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Options
            </div>
            <button
              onClick={() => update({ hasCorrection: !filters.hasCorrection })}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition ${
                filters.hasCorrection
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Avec corrigé seulement
              </span>
              {/*
                BUGFIX 2026-08-09: same double-toggle issue as the
                CategorySwitch below — Switch.Root's onCheckedChange
                fired a second toggle on top of the outer <button>
                onClick, cancelling itself out. Switch is now a pure
                visual indicator.
              */}
              <span
                role="img"
                aria-hidden="true"
                className={`w-9 h-5 rounded-full relative transition ${
                  filters.hasCorrection ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`block w-4 h-4 bg-white rounded-full shadow transition-transform absolute top-0.5 ${
                    filters.hasCorrection ? 'translate-x-[18px]' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
            <div className="text-[11px] text-slate-500 mt-1.5 ms-1">
              {data.facets.withCorrection.toLocaleString('fr-FR')} ressources avec corrigé
            </div>
          </div>

          {/* ----- CATÉGORIE (collège/lycée × pilote/ordinaire) — 4 Switches combinables -----
           * This wrapper is ALWAYS rendered (no conditional). The "ressources
           * dans les catégories sélectionnées" line below is the only conditional
           * child. */}
          <div className="mt-4 pt-3 border-t border-slate-200">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Catégorie
            </div>
            <div className="space-y-2">
              <CategorySwitch
                icon="🎓"
                label="Collège pilote"
                count={data.facets.collegePilote}
                active={filters.collegePilote}
                color="fuchsia"
                onToggle={() => update({ collegePilote: !filters.collegePilote })}
              />
              <CategorySwitch
                icon="🏫"
                label="Collège ordinaire"
                count={data.facets.collegeOrdinaire}
                active={filters.collegeOrdinaire}
                color="emerald"
                onToggle={() => update({ collegeOrdinaire: !filters.collegeOrdinaire })}
              />
              <CategorySwitch
                icon="🎓"
                label="Lycée pilote"
                count={data.facets.lyceePilote}
                active={filters.lyceePilote}
                color="fuchsia"
                onToggle={() => update({ lyceePilote: !filters.lyceePilote })}
              />
              <CategorySwitch
                icon="🏫"
                label="Lycée ordinaire"
                count={data.facets.lyceeOrdinaire}
                active={filters.lyceeOrdinaire}
                color="emerald"
                onToggle={() => update({ lyceeOrdinaire: !filters.lyceeOrdinaire })}
              />
            </div>
            {(filters.collegePilote ||
              filters.collegeOrdinaire ||
              filters.lyceePilote ||
              filters.lyceeOrdinaire) ? (
              <div className="text-[11px] text-slate-500 mt-2 ms-1">
                {(
                  (filters.collegePilote ? data.facets.collegePilote : 0) +
                  (filters.collegeOrdinaire ? data.facets.collegeOrdinaire : 0) +
                  (filters.lyceePilote ? data.facets.lyceePilote : 0) +
                  (filters.lyceeOrdinaire ? data.facets.lyceeOrdinaire : 0)
                ).toLocaleString('fr-FR')}{' '}
                ressources dans les catégories sélectionnées
              </div>
            ) : (
              /* Always render a sibling placeholder so the Catégorie wrapper's
               * child count stays stable (3 children: label + switches + this
               * div, regardless of whether any category filter is active).
               * 2026-08-05: prevents React #418/#422 when toggling category
               * filters on /ressources. */
              <div className="text-[11px] text-slate-500 mt-2 ms-1 hidden" aria-hidden="true" />
            )}
          </div>
        </div>
      </aside>

      {/* ============== MAIN ============== */}
      <div>
        {/* ----- Toolbar ----- */}
        <div className="flex items-center justify-between mb-4 bg-white rounded-xl border border-slate-200 px-4 py-3 gap-2 flex-wrap">
          <div className="text-sm flex items-center gap-2">
            {isFetching ? (
              <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-primary-500" />
            )}
            <span>
              <strong className="font-bold text-slate-900">
                {data.total.toLocaleString('fr-FR')}
              </strong>{' '}
              <span className="text-slate-500">ressource{data.total > 1 ? 's' : ''}</span>
              {data.total > 0 && data.totalPages > 1 && (
                <span className="text-slate-400 ms-1">
                  · page {data.currentPage}/{data.totalPages}
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <ToggleGroup.Root
              type="single"
              value={filters.view}
              onValueChange={(v) => v && update({ view: v as 'grid' | 'list' })}
              className="inline-flex items-center bg-slate-100 rounded-lg p-0.5"
            >
              <ToggleGroup.Item
                value="grid"
                aria-label="Grille"
                className="p-1.5 rounded-md data-[state=on]:bg-white data-[state=on]:shadow-sm transition"
              >
                <LayoutGrid className="w-4 h-4" />
              </ToggleGroup.Item>
              <ToggleGroup.Item
                value="list"
                aria-label="Liste"
                className="p-1.5 rounded-md data-[state=on]:bg-white data-[state=on]:shadow-sm transition"
              >
                <List className="w-4 h-4" />
              </ToggleGroup.Item>
            </ToggleGroup.Root>

            {/* Sort */}
            <Popover.Root>
              <Popover.Trigger asChild>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{SORT_META[filters.sort]}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-[180px] bg-white border border-slate-200 rounded-xl shadow-xl p-1"
                >
                  {Object.entries(SORT_META).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => {
                        update({ sort: value as any });
                        document.body.click();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition ${
                        filters.sort === value
                          ? 'bg-primary-50 text-primary-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                      {filters.sort === value && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>

        {/* ----- Active filter chips -----
         * Always render the wrapper AND its single child (the inner chips
         * div) with a stable DOM structure. The wrapper's className toggles
         * `hidden` to hide it when activeCount === 0 — className changes are
         * attribute updates, NOT structural, so React's hydration check
         * stays happy. The inner <ActiveFilterChips> now also always renders
         * its own div (with stable structure), and toggles its inner contents
         * (chips + reset button) via CSS visibility.
         *
         * History:
         *   - 2026-08-04 (this fix): the previous version (commit 7c4a68b)
         *     only "always-rendered" the outer wrapper but still
         *     conditionally rendered <ActiveFilterChips> inside it (and
         *     ActiveFilterChips itself returned `null` when chips.length ===
         *     0). That meant the wrapper's CHILD COUNT was 0 when no
         *     filters and 1 when filters were active, AND the inner
         *     chips div's child count varied with the chip count. Both of
         *     these triggered React #418/#422 hydration mismatches when
         *     the streamed page replaced the loading.tsx skeleton
         *     (ERR-UJT75R 5x #422, ERR-572C9N 5x #418, ERR-HKCF93 1x #418,
         *     ERR-TEU2DB 1x #422 — 12 events in 2026-08-04 digest). */}
        <div
          className={`flex flex-wrap gap-1.5 mb-4 ${activeCount > 0 ? '' : 'hidden'}`}
          aria-hidden={activeCount === 0}
        >
          <ActiveFilterChips
            filters={filters}
            onRemove={(patch) => update(patch)}
            onReset={reset}
            nameMaps={data.nameMaps}
          />
        </div>

        {/* ----- Results -----
         * ALWAYS render BOTH the grid AND the empty state as siblings,
         * hiding one via CSS based on data.resources.length. This keeps the
         * main content wrapper's child count stable (5 children: toolbar +
         * chips wrapper + results-grid + empty-state + pagination wrapper)
         * so the loading.tsx skeleton can be patched against the streamed
         * page without React #418/#422 hydration mismatches.
         *
         * The previous version (pre-2026-08-05) used a ternary
         * `{data.resources.length === 0 ? <EmptyState/> : <Grid/>}`, which
         * meant the DOM had either the empty-state div (4 children: div+h3+
         * p+button) OR the grid (N <a> children) — but never both. The
         * loading.tsx skeleton always renders 6 <a> skeleton cards inside
         * the grid, so when the page rendered 0 results (e.g.
         * /ressources?class=7eme&subject=svt&type=HOMEWORK), the empty-state
         * branch's child count (4) didn't match the skeleton's (6),
         * triggering #418/#422.
         *
         * 2026-08-05 fixes: ERR-Y87HMD (4x #418 on /ressources?class=7eme&subject=svt&type=HOMEWORK).
         * History of this pattern: see commit afbcf79 (chips wrapper) and
         * the wider examanet-hydration-patterns topic. */}
        <div
          className={
            filters.view === 'grid'
              ? `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 ${data.resources.length === 0 ? 'hidden' : ''}`
              : `space-y-2 ${data.resources.length === 0 ? 'hidden' : ''}`
          }
          aria-hidden={data.resources.length === 0}
        >
          {data.resources.map((r) =>
            filters.view === 'list' ? (
              <ResourceListItem
                key={r.id}
                resource={{ ...r, isFavorited: favorites.has(r.id) }}
              />
            ) : (
              <ResourceCard
                key={r.id}
                resource={{ ...r, isFavorited: favorites.has(r.id) } as any}
              />
            ),
          )}
        </div>
        {/* Empty state — ALWAYS rendered as a sibling of the grid above.
         * Hidden via CSS when there are results. */}
        <div
          className={`bg-white rounded-2xl border border-slate-200 p-12 text-center ${data.resources.length === 0 ? '' : 'hidden'}`}
          aria-hidden={data.resources.length > 0}
        >
          <div className="text-6xl mb-3">🔍</div>
          <h3 className="font-bold text-xl mb-2">Aucun résultat</h3>
          <p className="text-slate-500 mb-5 text-sm">
            Essayez d'élargir vos critères ou supprimez quelques filtres.
          </p>
          <button onClick={reset} className="btn-primary inline-flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Réinitialiser tous les filtres
          </button>
        </div>

        {/* ----- Pagination -----
         * Always render the wrapper, hidden via CSS when there's only 1 page
         * (or zero results). Mirrors the pattern used for the active-filter
         * chips wrapper above: keeping the parent's child count stable
         * (5 children: toolbar + chips wrapper + results-grid + empty-state +
         * pagination wrapper) so the Suspense fallback in loading.tsx can be
         * patched against the streamed page without React #418/#422 hydration
         * mismatches. The wrapper uses `hidden` (CSS) rather than conditional
         * rendering so the DOM element is always present, matching the
         * loading.tsx placeholder. */}
        <div
          className={data.totalPages > 1 ? 'mt-8' : 'hidden'}
          aria-hidden={data.totalPages <= 1}
        >
          {data.totalPages > 1 && (
            <Pagination
              current={data.currentPage}
              total={data.totalPages}
              onChange={(p) => update({ page: p })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============== CATEGORY SWITCH (multi-select, like hasCorrection) ==============
function CategorySwitch({
  icon,
  label,
  count,
  active,
  color,
  onToggle,
}: {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  color: 'fuchsia' | 'emerald';
  onToggle: () => void;
}) {
  const activeClasses = color === 'fuchsia'
    ? 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  const inactiveClasses = 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300';
  const switchActive = color === 'fuchsia' ? 'bg-fuchsia-500' : 'bg-emerald-500';
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition ${active ? activeClasses : inactiveClasses}`}
      aria-pressed={active}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">{icon}</span>
        <span className="font-semibold truncate">{label}</span>
      </span>
      {/*
        BUGFIX 2026-08-09: previously this Switch.Root had
        `onCheckedChange={onToggle}` which fired the toggle a SECOND
        time on every click (the outer <button> onClick already does).
        The double-toggle cancelled itself out — `lyceePilote: false`
        → `true` → `false` in the same tick — so the visible filter
        state never changed and the auto-update never fired.
        Fix: the Switch is now a pure visual indicator. We render it
        with `checked={active}` only, no onCheckedChange handler. To
        still allow keyboard activation (Space/Enter) on the switch
        for a11y, we keep the outer <button> as the single source of
        truth for the toggle action.
      */}
      <span
        role="img"
        aria-hidden="true"
        className={`w-9 h-5 rounded-full relative transition ${active ? switchActive : 'bg-slate-300'}`}
      >
        <span
          className={`block w-4 h-4 bg-white rounded-full shadow transition-transform absolute top-0.5 ${
            active ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

// ============== MULTI-SELECT CHIPS ==============
function MultiSelectChips({
  label,
  icon: Icon,
  options,
  selected,
  onToggle,
}: {
  label: string;
  icon: LucideIcon;
  options: { value: string; label: string; emoji?: string; color?: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));

  // Show top 6 inline, with a "voir plus" popover
  const topInline = options.slice(0, 6);
  const remaining = Math.max(0, options.length - 6);

  return (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
        <span className="text-slate-400 font-normal normal-case ml-auto">({options.length})</span>
      </label>

      <div className="flex flex-wrap gap-1.5">
        {topInline.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
              }`}
            >
              {opt.emoji && <span className="text-[11px]">{opt.emoji}</span>}
              <span className="truncate max-w-[120px]">{opt.label}</span>
              <span
                className={`tabular-nums text-[10px] ${
                  isSelected ? 'opacity-70' : 'text-slate-400'
                }`}
              >
                {opt.count}
              </span>
            </button>
          );
        })}

        {remaining > 0 && (
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
              <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition">
                +{remaining} autres
                <ChevronDown className="w-3 h-3" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={4}
                className="z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3"
              >
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mb-2 focus:ring-2 focus:ring-primary-200 focus:border-primary-400 outline-none"
                />
                <div className="max-h-72 overflow-y-auto space-y-0.5">
                  {filtered.map((opt) => {
                    const isSelected = selected.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => onToggle(opt.value)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition ${
                          isSelected
                            ? 'bg-slate-900 text-white'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        {opt.emoji && <span>{opt.emoji}</span>}
                        <span className="flex-1 truncate">{opt.label}</span>
                        <span
                          className={`text-xs tabular-nums ${isSelected ? 'opacity-70' : 'text-slate-400'}`}
                        >
                          {opt.count}
                        </span>
                      </button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <p className="text-center text-sm text-slate-400 py-4">Aucun résultat</p>
                  )}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </div>
  );
}

// ============== ACTIVE FILTER CHIPS ==============
function ActiveFilterChips({
  filters,
  onRemove,
  onReset,
  nameMaps,
}: {
  filters: any;
  onRemove: (patch: any) => void;
  onReset: () => void;
  nameMaps?: {
    class?: Record<string, string>;
    section?: Record<string, string>;
    subject?: Record<string, string>;
  };
}) {
  const chips: { key: string; label: string; onRemove: () => void; color: string }[] = [];

  if (filters.q) {
    chips.push({
      key: 'q',
      label: `« ${filters.q} »`,
      onRemove: () => onRemove({ q: '' }),
      color: 'bg-slate-900 text-white',
    });
  }
  filters.type.forEach((v: string) => {
    chips.push({
      key: `type-${v}`,
      label: TYPE_META[v]?.label || v,
      onRemove: () => onRemove({ type: filters.type.filter((x: string) => x !== v) }),
      color: TYPE_META[v]?.color || 'bg-slate-100 text-slate-700',
    });
  });
  filters.subject.forEach((v: string) => {
    chips.push({
      key: `subject-${v}`,
      label: nameMaps?.subject?.[v] || v,
      onRemove: () => onRemove({ subject: filters.subject.filter((x: string) => x !== v) }),
      color: 'bg-violet-100 text-violet-700',
    });
  });
  filters.class.forEach((v: string) => {
    chips.push({
      key: `class-${v}`,
      label: nameMaps?.class?.[v] || v,
      onRemove: () => onRemove({ class: filters.class.filter((x: string) => x !== v) }),
      color: 'bg-indigo-100 text-indigo-700',
    });
  });
  filters.section.forEach((v: string) => {
    chips.push({
      key: `section-${v}`,
      label: nameMaps?.section?.[v] || v,
      onRemove: () => onRemove({ section: filters.section.filter((x: string) => x !== v) }),
      color: 'bg-cyan-100 text-cyan-700',
    });
  });
  filters.year.forEach((v: string) => {
    chips.push({
      key: `year-${v}`,
      label: v,
      onRemove: () => onRemove({ year: filters.year.filter((x: string) => x !== v) }),
      color: 'bg-orange-100 text-orange-700',
    });
  });
  filters.trimestre.forEach((v: string) => {
    chips.push({
      key: `trimestre-${v}`,
      label: TRIMESTRE_META[v]?.label || `Trim. ${v}`,
      onRemove: () => onRemove({ trimestre: filters.trimestre.filter((x: string) => x !== v) }),
      color: 'bg-purple-100 text-purple-700',
    });
  });
  filters.language.forEach((v: string) => {
    chips.push({
      key: `language-${v}`,
      label: `${LANGUAGE_META[v]?.flag || ''} ${LANGUAGE_META[v]?.label || v}`.trim(),
      onRemove: () => onRemove({ language: filters.language.filter((x: string) => x !== v) }),
      color: 'bg-teal-100 text-teal-700',
    });
  });
  if (filters.hasCorrection) {
    chips.push({
      key: 'correction',
      label: 'Avec corrigé',
      onRemove: () => onRemove({ hasCorrection: false }),
      color: 'bg-emerald-100 text-emerald-700',
    });
  }
  if (filters.collegePilote) {
    chips.push({
      key: 'collegePilote',
      label: 'Collège pilote',
      onRemove: () => onRemove({ collegePilote: false }),
      color: 'bg-fuchsia-100 text-fuchsia-700',
    });
  }
  if (filters.collegeOrdinaire) {
    chips.push({
      key: 'collegeOrdinaire',
      label: 'Collège ordinaire',
      onRemove: () => onRemove({ collegeOrdinaire: false }),
      color: 'bg-emerald-100 text-emerald-700',
    });
  }
  if (filters.lyceePilote) {
    chips.push({
      key: 'lyceePilote',
      label: 'Lycée pilote',
      onRemove: () => onRemove({ lyceePilote: false }),
      color: 'bg-fuchsia-100 text-fuchsia-700',
    });
  }
  if (filters.lyceeOrdinaire) {
    chips.push({
      key: 'lyceeOrdinaire',
      label: 'Lycée ordinaire',
      onRemove: () => onRemove({ lyceeOrdinaire: false }),
      color: 'bg-emerald-100 text-emerald-700',
    });
  }

  if (chips.length === 0) {
    // Always render the wrapper div with a stable structure (the wrapper
    // itself is the parent of <ActiveFilterChips>'s caller in FilterShell).
    // The chips + reset button are hidden via CSS, so the React tree
    // stays identical to the loading.tsx skeleton (which also renders an
    // empty div with `hidden`). This is the "always render, hide via CSS"
    // pattern from examanet-hydration-patterns — eliminates React
    // #418/#422 hydration mismatches when the streamed page replaces the
    // Suspense fallback.
    return (
      <div
        className="flex flex-wrap gap-1.5 mb-4 hidden"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {chips.map((c) => (
        <span
          key={c.key}
          className={`inline-flex items-center gap-1.5 ps-3 pe-1 py-1 rounded-full text-xs font-semibold ${c.color}`}
        >
          {c.label}
          <button
            onClick={c.onRemove}
            className="p-0.5 rounded-full hover:bg-black/10 transition"
            aria-label="Retirer le filtre"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button
        onClick={onReset}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-red-600 hover:bg-red-50 transition"
      >
        Tout effacer
      </button>
    </div>
  );
}

// ============== PAGINATION ==============
function Pagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (page: number) => void;
}) {
  // Build visible page numbers with ellipsis
  const pages: (number | '...')[] = [];
  const add = (p: number | '...') => pages.push(p);

  // Always show: 1, current-1, current, current+1, last
  // Add ellipsis where there are gaps
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  for (let i = 1; i <= total; i++) {
    if (set.has(i)) {
      // Add ellipsis before if needed
      if (
        pages.length > 0 &&
        typeof pages[pages.length - 1] === 'number' &&
        i - (pages[pages.length - 1] as number) > 1
      ) {
        add('...');
      }
      add(i);
    }
  }

  return (
    <nav className="flex items-center justify-center gap-1 mt-8 flex-wrap" aria-label="Pagination">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current === 1}
        className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:border-primary-300 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        ← Précédent
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="px-2 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-w-[40px] h-10 px-3 rounded-lg text-sm font-semibold transition ${
              p === current
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 hover:border-primary-300 hover:text-primary-600'
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(current + 1)}
        disabled={current === total}
        className="px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 hover:border-primary-300 hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Suivant →
      </button>
    </nav>
  );
}

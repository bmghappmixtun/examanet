'use client';

/**
 * DevoirsListing — Pinterest-style masonry + left sidebar filters + infinite scroll
 *
 * Filter hierarchy:
 *   1. Class (top sticky tabs)
 *   2. Trimestre (left sidebar) — 1, 2, 3, all
 *   3. Type (left sidebar, nested per trimestre) — Controle N°X, Synthèse N°X
 *
 * URL params: ?class=X&trimestre=Y&subtype=Z&number=W
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import ResourceCard from '@/components/resources/ResourceCard';
import { Loader2, BookOpen, ChevronDown } from 'lucide-react';

interface DevoirsListingProps {
  subject: { slug: string; nameFr: string; color: string | null };
  classes: { slug: string; labelFr: string }[];
  initialItems: any[];
  initialTotal: number;
  initialNextCursor: number | null;
  initialClassSlug: string | null;
  initialFacets: FacetsData;
}

interface FilterOption {
  trimestre: number;
  subtype: string;
  number: number | null;
  count: number;
}

interface FacetsData {
  total: number;
  trimestres: Record<string, number>;
  filters: FilterOption[];
}

const PAGE_SIZE = 24;
const SUBTYPE_LABELS: Record<string, { fr: string; short: string }> = {
  CONTROLE: { fr: 'Devoir de contrôle', short: 'Contrôle' },
  SYNTHESE: { fr: 'Devoir de synthèse', short: 'Synthèse' },
  MAISON: { fr: 'Devoir à la maison', short: 'Maison' },
  REVISION: { fr: 'Révision', short: 'Révision' },
};

export default function DevoirsListing({
  subject,
  classes,
  initialItems,
  initialTotal,
  initialNextCursor,
  initialClassSlug,
  initialFacets,
}: DevoirsListingProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeClass = initialClassSlug;
  const activeTrimestre = searchParams.get('trimestre');
  const activeSubtype = searchParams.get('subtype');
  const activeNumber = searchParams.get('number');

  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<FacetsData>(initialFacets);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Helper: update URL params
  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '') params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Filter handlers
  const handleClassChange = useCallback(
    (slug: string | null) => {
      // Reset all other filters when class changes
      setItems([]);
      setNextCursor(null);
      updateUrl({ class: slug, trimestre: null, subtype: null, number: null });
    },
    [updateUrl],
  );

  const handleTrimestreChange = useCallback(
    (tri: string | null) => {
      setItems([]);
      setNextCursor(null);
      updateUrl({ trimestre: tri, subtype: null, number: null });
    },
    [updateUrl],
  );

  const handleTypeClick = useCallback(
    (subtype: string | null, number: string | null) => {
      setItems([]);
      setNextCursor(null);
      updateUrl({ subtype, number });
    },
    [updateUrl],
  );

  const handleResetTypes = useCallback(() => {
    setItems([]);
    setNextCursor(null);
    updateUrl({ subtype: null, number: null });
  }, [updateUrl]);

  // Fetch next page
  const fetchNext = useCallback(async () => {
    if (loading || nextCursor === null) return;
    setLoading(true);
    try {
      const url = new URL(`/api/devoirs/${subject.slug}`, window.location.origin);
      if (activeClass) url.searchParams.set('class', activeClass);
      if (activeTrimestre) url.searchParams.set('trimestre', activeTrimestre);
      if (activeSubtype) url.searchParams.set('subtype', activeSubtype);
      if (activeNumber) url.searchParams.set('number', activeNumber);
      url.searchParams.set('cursor', String(nextCursor));
      url.searchParams.set('limit', String(PAGE_SIZE));
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems((prev) => [...prev, ...(data.items || [])]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      console.error('[DevoirsListing] fetchNext failed:', e);
    } finally {
      setLoading(false);
    }
  }, [activeClass, activeTrimestre, activeSubtype, activeNumber, loading, nextCursor, subject.slug]);

  // Refetch items + facets when filters change (URL changed)
  useEffect(() => {
    const fetchInitial = async () => {
      setLoading(true);
      try {
        // Fetch items
        const url = new URL(`/api/devoirs/${subject.slug}`, window.location.origin);
        if (activeClass) url.searchParams.set('class', activeClass);
        if (activeTrimestre) url.searchParams.set('trimestre', activeTrimestre);
        if (activeSubtype) url.searchParams.set('subtype', activeSubtype);
        if (activeNumber) url.searchParams.set('number', activeNumber);
        url.searchParams.set('limit', String(PAGE_SIZE));

        // Fetch facets (only if class changed)
        const facetUrl = new URL(`/api/devoirs/${subject.slug}/facets`, window.location.origin);
        if (activeClass) facetUrl.searchParams.set('class', activeClass);

        const [itemsRes, facetsRes] = await Promise.all([
          fetch(url.toString()),
          fetch(facetUrl.toString()),
        ]);
        if (itemsRes.ok) {
          const itemsData = await itemsRes.json();
          setItems(itemsData.items || []);
          setNextCursor(itemsData.nextCursor);
        }
        if (facetsRes.ok) {
          const facetsData = await facetsRes.json();
          setFacets(facetsData);
        }
      } catch (e) {
        console.error('[DevoirsListing] initial fetch failed:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClass, activeTrimestre, activeSubtype, activeNumber]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const sentinel = sentinelRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor !== null && !loading) {
          fetchNext();
        }
      },
      { rootMargin: '600px' },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [fetchNext, loading, nextCursor]);

  // Build trimestres list with counts (handle null as "non classifié")
  const trimestresList = [1, 2, 3].map((t) => ({
    value: String(t),
    label: `${t}${t === 1 ? 'er' : 'ème'} Trimestre`,
    count: facets.trimestres[String(t)] || 0,
  }));

  // Group filters by trimestre → subtype → numbers
  const filtersByTrim: Record<number, Record<string, FilterOption[]>> = {};
  for (const f of facets.filters) {
    if (!filtersByTrim[f.trimestre]) filtersByTrim[f.trimestre] = {};
    if (!filtersByTrim[f.trimestre][f.subtype]) filtersByTrim[f.trimestre][f.subtype] = [];
    filtersByTrim[f.trimestre][f.subtype].push(f);
  }

  const activeTrimNum = activeTrimestre ? parseInt(activeTrimestre, 10) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* ========== LEFT SIDEBAR ========== */}
      <aside className="lg:sticky lg:top-32 self-start space-y-4">
        {/* CLASSES (top sticky but also shown here for completeness) */}
        <FilterSection title="Classe">
          <FilterButton
            active={activeClass === null}
            onClick={() => handleClassChange(null)}
            label="Toutes les classes"
            count={facets.total}
          />
          {classes.map((c) => {
            const inThisClass = activeClass === c.slug;
            return (
              <FilterButton
                key={c.slug}
                active={inThisClass}
                onClick={() => handleClassChange(c.slug)}
                label={c.labelFr}
                count={inThisClass ? facets.total : null}
              />
            );
          })}
        </FilterSection>

        {/* TRIMESTRES */}
        <FilterSection title="Trimestre">
          <FilterButton
            active={activeTrimestre === null}
            onClick={() => handleTrimestreChange(null)}
            label="Toute l'année"
            count={facets.total}
          />
          {trimestresList.map((t) => (
            <FilterButton
              key={t.value}
              active={activeTrimestre === t.value}
              onClick={() => handleTrimestreChange(t.value)}
              label={t.label}
              count={t.count}
            />
          ))}
        </FilterSection>

        {/* DEVOIR TYPES (per trimestre) */}
        {activeTrimNum && filtersByTrim[activeTrimNum] && (
          <FilterSection title={`Type — ${activeTrimNum}${activeTrimNum === 1 ? 'er' : 'ème'} Trim.`}>
            <FilterButton
              active={!activeSubtype}
              onClick={() => handleResetTypes()}
              label="Tous les types"
              count={facets.trimestres[String(activeTrimNum)] || 0}
            />
            {Object.entries(filtersByTrim[activeTrimNum]).map(([subtype, options]) => (
              <div key={subtype} className="space-y-1 mt-2">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 px-2">
                  {SUBTYPE_LABELS[subtype]?.short || subtype}
                </div>
                {options.map((opt) => {
                  const key = `${subtype}-${opt.number ?? 'null'}`;
                  const isActive =
                    activeSubtype === subtype && activeNumber === String(opt.number);
                  return (
                    <FilterButton
                      key={key}
                      active={isActive}
                      onClick={() => handleTypeClick(subtype, opt.number !== null ? String(opt.number) : null)}
                      label={`${SUBTYPE_LABELS[subtype]?.short || subtype} N°${opt.number ?? '?'}`}
                      count={opt.count}
                      small
                    />
                  );
                })}
              </div>
            ))}
          </FilterSection>
        )}
      </aside>

      {/* ========== MAIN CONTENT ========== */}
      <div>
        {/* Active filter pills (visible when filters applied) */}
        {(activeTrimestre || activeSubtype) && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Filtres actifs:</span>
            {activeTrimestre && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-sm font-semibold">
                {activeTrimNum}
                {activeTrimNum === 1 ? 'er' : 'ème'} Trimestre
              </span>
            )}
            {activeSubtype && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-sm font-semibold">
                {SUBTYPE_LABELS[activeSubtype]?.short || activeSubtype} N°{activeNumber}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setItems([]);
                setNextCursor(null);
                updateUrl({ trimestre: null, subtype: null, number: null });
              }}
              className="text-xs text-slate-500 hover:text-red-600 underline"
            >
              Effacer
            </button>
          </div>
        )}

        {/* EMPTY STATE */}
        {items.length === 0 && !loading && (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-700 mb-2">
              Aucun devoir {subject.nameFr} disponible
            </h2>
            <p className="text-sm text-slate-500">pour ce filtre. Essayez un autre trimestre ou type.</p>
          </div>
        )}

        {/* MASONRY GRID */}
        {items.length > 0 && (
          <div
            className="columns-1 sm:columns-2 lg:columns-3 gap-5"
            style={{ columnFill: 'balance' }}
          >
            {items.map((item) => (
              <div key={item.id} className="mb-5 break-inside-avoid">
                <ResourceCard resource={item} />
              </div>
            ))}
          </div>
        )}

        {/* SENTINEL + LOADER */}
        <div ref={sentinelRef} className="py-8 flex justify-center">
          {loading && (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          )}
          {!loading && nextCursor === null && items.length > 0 && (
            <p className="text-sm text-slate-500">
              ✓ Vous avez vu tous les {items.length} devoirs disponibles.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================== UI PRIMITIVES ====================== */

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-700">
        {title}
      </div>
      <div className="p-2 space-y-0.5">{children}</div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
  small,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number | null;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-start px-2.5 py-1.5 rounded-lg transition flex items-center justify-between gap-2 ${
        active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'hover:bg-slate-100 text-slate-700'
      } ${small ? 'text-xs' : 'text-sm'}`}
    >
      <span className={`truncate ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
      {count !== undefined && count !== null && (
        <span
          className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full ${
            active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {count.toLocaleString('fr-FR')}
        </span>
      )}
    </button>
  );
}

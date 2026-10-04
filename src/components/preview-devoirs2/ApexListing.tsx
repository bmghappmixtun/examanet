'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, LayoutGrid, X, Loader2, Calendar, Eye, Rows3 } from 'lucide-react';
import ResourceCard from '@/components/resources/ResourceCard';
import styles from './apex-devoirs.module.css';
import { useDevoirsContext } from './devoirs-context';
import SidebarFilters from './SidebarFilters';

interface ListingProps {
  subject: { slug: string; nameFr: string };
  classes: { slug: string; labelFr: string }[];
}

type Density = 'comfortable' | 'compact' | 'wide';

const SORT_LABELS: Record<string, string> = {
  recent: 'Plus récents',
  popular: 'Plus vus',
  downloads: 'Plus téléchargés',
};

export default function ApexListing({ subject, classes }: ListingProps) {
  const ctx = useDevoirsContext();
  const {
    classSlug, trimestre: activeTrimestre, subtype: activeSubtype, number: activeNumber, sortMode,
    setTrimestre, setType, setSort, setClass,
  } = ctx;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const progressCircleRef = useRef<SVGCircleElement | null>(null);

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<{ total: number; trimestres: Record<string, number>; filters: any[]; subtypes: any[] }>({
    total: 0, trimestres: {}, filters: [], subtypes: [],
  });

  const [density, setDensity] = useState<Density>('comfortable');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem('apex-density') as Density | null;
    if (saved && saved !== density) setDensity(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('apex-density', density);
  }, [density]);

  // Refetch on URL state change
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const listUrl = new URL(`/api/preview-devoirs2/${subject.slug}/list`, window.location.origin);
        if (classSlug) listUrl.searchParams.set('class', classSlug);
        if (activeTrimestre) listUrl.searchParams.set('trimestre', activeTrimestre);
        if (activeSubtype) listUrl.searchParams.set('subtype', activeSubtype);
        if (activeNumber) listUrl.searchParams.set('number', activeNumber);
        listUrl.searchParams.set('sort', sortMode);
        listUrl.searchParams.set('limit', '24');

        const facetUrl = new URL(`/api/preview-devoirs2/${subject.slug}/facets`, window.location.origin);
        if (classSlug) facetUrl.searchParams.set('class', classSlug);

        const [listRes, facetRes] = await Promise.all([fetch(listUrl.toString()), fetch(facetUrl.toString())]);
        if (cancelled) return;
        if (listRes.ok) {
          const d = await listRes.json();
          setItems(d.items || []);
          setNextCursor(d.nextCursor);
        }
        if (facetRes.ok) {
          setFacets(await facetRes.json());
        }
      } catch (e) {
        console.error('[ApexListing] fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [subject.slug, classSlug, activeTrimestre, activeSubtype, activeNumber, sortMode]);

  // Infinite scroll
  const fetchNext = async () => {
    if (loading || nextCursor === null) return;
    setLoading(true);
    try {
      const url = new URL(`/api/preview-devoirs2/${subject.slug}/list`, window.location.origin);
      if (classSlug) url.searchParams.set('class', classSlug);
      if (activeTrimestre) url.searchParams.set('trimestre', activeTrimestre);
      if (activeSubtype) url.searchParams.set('subtype', activeSubtype);
      if (activeNumber) url.searchParams.set('number', activeNumber);
      url.searchParams.set('sort', sortMode);
      url.searchParams.set('cursor', String(nextCursor));
      url.searchParams.set('limit', '24');
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setItems((prev) => [...prev, ...(d.items || [])]);
      setNextCursor(d.nextCursor);
    } catch (e) {
      console.error('[ApexListing] fetchNext failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor !== null && !loading) fetchNext();
      },
      { rootMargin: '600px' },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [nextCursor, loading]);

  // Progress ring
  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const progress = total > 0 ? Math.min(1, window.scrollY / total) : 0;
      if (progressCircleRef.current) {
        const c = 2 * Math.PI * 22;
        progressCircleRef.current.style.strokeDashoffset = String(c * (1 - progress));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const SUBTYPE_LABELS: Record<string, string> = {
    CONTROLE: 'Contrôle',
    SYNTHESE: 'Synthèse',
    MAISON: 'Maison',
    REVISION: 'Révision',
  };

  const hasActiveFilters = !!(classSlug || activeTrimestre || activeSubtype);

  const activeClassLabel = classSlug ? classes.find((c) => c.slug === classSlug)?.labelFr : null;
  const activeTypeLabel = activeSubtype
    ? `${SUBTYPE_LABELS[activeSubtype] || activeSubtype}${activeNumber ? ` N°${activeNumber}` : ''}`
    : null;

  return (
    <div className={`${styles.pageLayout} ${!sidebarVisible ? styles.pageLayoutNoSidebar : ''}`}>
      {/* SIDEBAR CELL — contains show button + sidebar in one grid cell */}
      <div className={styles.sidebarCell}>
        {/* Show button — visible only when sidebar is hidden, overflows the 0px column */}
        <button
          onClick={() => setSidebarVisible(true)}
          className={`${styles.showFiltersBtn} ${sidebarVisible ? styles.hidden : ''}`}
          aria-label="Afficher les filtres"
        >
          <Eye size={16} />
          <span>Afficher les filtres</span>
        </button>

        <SidebarFilters
          facets={facets}
          classes={classes}
          resultCount={facets.total}
          visible={sidebarVisible}
          onToggleVisible={() => setSidebarVisible((v) => !v)}
        />
      </div>

      {/* MAIN CONTENT */}
      <div>
        {/* Top toolbar with active filter pills + sort (no result count) */}
        <div className={styles.topToolbar}>
          <div className={styles.topToolbarLeft}>
            {hasActiveFilters && (
              <>
                {activeClassLabel && (
                  <button className={styles.activeFilterPill} onClick={() => setClass(null)}>
                    {activeClassLabel}
                    <span className={styles.activeFilterClose}>
                      <X size={18} strokeWidth={2.5} />
                    </span>
                  </button>
                )}
                {activeTrimestre && (
                  <button className={styles.activeFilterPill} onClick={() => setTrimestre(null)}>
                    Trimestre {activeTrimestre}
                    <span className={styles.activeFilterClose}>
                      <X size={18} strokeWidth={2.5} />
                    </span>
                  </button>
                )}
                {activeTypeLabel && (
                  <button className={styles.activeFilterPill} onClick={() => setType(null, null)}>
                    {activeTypeLabel}
                    <span className={styles.activeFilterClose}>
                      <X size={18} strokeWidth={2.5} />
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
          <div className={styles.topToolbarRight}>
            <div className={styles.densityToggle} role="group" aria-label="Density">
              <button
                onClick={() => setDensity('comfortable')}
                className={`${styles.densityBtn} ${density !== 'compact' ? styles.active : ''}`}
                aria-label="Confortable"
                title="Confortable"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setDensity('wide')}
                className={`${styles.densityBtn} ${density === 'wide' ? styles.active : ''}`}
                aria-label="Pleine largeur"
                title="Pleine largeur (1 par ligne)"
              >
                <Rows3 size={14} />
              </button>
            </div>
            <button
              onClick={() => {
                const order = ['recent', 'popular', 'downloads'];
                const idx = order.indexOf(sortMode);
                setSort(order[(idx + 1) % order.length]);
              }}
              className={styles.sortButton}
            >
              {sortMode === 'recent' ? <Calendar size={14} /> : <ArrowDown size={14} />}
              {SORT_LABELS[sortMode] || sortMode}
            </button>
          </div>
        </div>

        {/* Cards grid (masonry) */}
        <div className={styles.classicGrid} data-density={density}>
          {items.length === 0 && !loading ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem 0', color: 'var(--muted)' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Aucun devoir pour ces filtres.</p>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Essayez d'élargir vos critères.</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className={styles.classicCardWrap}>
                <ResourceCard resource={item} />
              </div>
            ))
          )}

          {loading && items.length === 0 &&
            Array.from({ length: 8 }).map((_, i) => (
              <div key={`sk-${i}`} className={styles.classicCardWrap}>
                <div className={styles.skeletonCard} />
              </div>
            ))
          }
        </div>

        <div
          ref={sentinelRef}
          className={`${styles.loadFooter} ${nextCursor === null && items.length > 0 ? styles.end : ''}`}
        >
          {loading && items.length > 0 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Chargement…
            </span>
          ) : nextCursor === null && items.length > 0 ? (
            <span>✓ Vous avez vu tous les {items.length} devoirs.</span>
          ) : (
            <span style={{ opacity: 0.5 }}>Scroll pour charger plus</span>
          )}
        </div>

        <button
          className={styles.progressRing}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Retour en haut"
          style={{ opacity: items.length > 6 ? 1 : 0, pointerEvents: items.length > 6 ? 'auto' : 'none' }}
        >
          <svg viewBox="0 0 48 48">
            <circle
              ref={progressCircleRef}
              cx="24" cy="24" r="22"
              strokeDasharray={2 * Math.PI * 22}
              strokeDashoffset={2 * Math.PI * 22}
            />
          </svg>
          <ArrowUp size={18} style={{ position: 'relative' }} />
        </button>
      </div>
    </div>
  );
}

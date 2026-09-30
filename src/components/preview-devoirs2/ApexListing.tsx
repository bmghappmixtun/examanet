'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Grid3x3, LayoutGrid, X, Loader2, Eye, Download, Star, Calendar } from 'lucide-react';
import styles from './apex-devoirs.module.css';
import { useDevoirsContext } from './devoirs-context';
import SmartThumb from './SmartThumb';

interface ListingProps {
  subject: { slug: string; nameFr: string };
  classes: { slug: string; labelFr: string }[];
}

type Density = 'comfortable' | 'compact';

const SUBTYPE_LABELS: Record<string, string> = {
  CONTROLE: 'Contrôle',
  SYNTHESE: 'Synthèse',
  MAISON: 'Maison',
  REVISION: 'Révision',
};

const SORT_LABELS: Record<string, string> = {
  recent: 'Récents',
  popular: 'Plus vus',
  downloads: 'Plus DL',
};

export default function ApexListing({ subject, classes }: ListingProps) {
  const ctx = useDevoirsContext();
  const {
    classSlug, trimestre: activeTrimestre, subtype: activeSubtype, number: activeNumber, sortMode,
    setTrimestre, setType, clearAll, setSort,
  } = ctx;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const progressCircleRef = useRef<SVGCircleElement | null>(null);

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<{ total: number; trimestres: Record<string, number>; filters: any[] }>({
    total: 0, trimestres: {}, filters: [],
  });

  const [density, setDensity] = useState<Density>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('apex-density') as Density) || 'comfortable';
    }
    return 'comfortable';
  });
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

  // Group facets
  const filtersByTrim: Record<number, Record<string, any[]>> = {};
  for (const f of facets.filters) {
    if (!filtersByTrim[f.trimestre]) filtersByTrim[f.trimestre] = {};
    if (!filtersByTrim[f.trimestre][f.subtype]) filtersByTrim[f.trimestre][f.subtype] = [];
    filtersByTrim[f.trimestre][f.subtype].push(f);
  }

  const activeTrimNum = activeTrimestre ? parseInt(activeTrimestre, 10) : null;
  const isCompact = density === 'compact';
  const percent = facets.total > 0 ? Math.round((items.length / facets.total) * 100) : 0;

  return (
    <>
      <div className={styles.filterBar}>
        <div className={styles.filterBarInner}>
          {classSlug ? (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Classe</span>
              <button onClick={() => ctx.setClass(null)} className={`${styles.filterPill} ${styles.active}`}>
                {classes.find((c) => c.slug === classSlug)?.labelFr}
                <X size={12} style={{ marginLeft: 4 }} />
              </button>
            </div>
          ) : (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Classe</span>
              <span className={styles.filterPill} style={{ opacity: 0.5 }}>Toutes</span>
            </div>
          )}

          <div className={styles.filterDivider} />

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Trimestre</span>
            <button
              onClick={() => setTrimestre(null)}
              className={`${styles.filterPill} ${!activeTrimestre ? styles.active : ''}`}
            >
              Tout <span className={styles.count}>{facets.total}</span>
            </button>
            {[1, 2, 3].map((t) => (
              <button
                key={t}
                onClick={() => setTrimestre(String(t))}
                className={`${styles.filterPill} ${activeTrimestre === String(t) ? styles.active : ''}`}
              >
                T{t} <span className={styles.count}>{facets.trimestres[String(t)] || 0}</span>
              </button>
            ))}
          </div>

          {activeTrimNum && filtersByTrim[activeTrimNum] && (
            <>
              <div className={styles.filterDivider} />
              <div className={styles.filterGroup} style={{ maxWidth: '100%', overflowX: 'auto', flexWrap: 'wrap' }}>
                <span className={styles.filterLabel}>Type</span>
                <button
                  onClick={() => setType(null, null)}
                  className={`${styles.filterPill} ${!activeSubtype ? styles.active : ''}`}
                >
                  Tous <span className={styles.count}>{facets.trimestres[String(activeTrimNum)] || 0}</span>
                </button>
                {Object.entries(filtersByTrim[activeTrimNum]).flatMap(([subtype, options]) =>
                  options.map((opt: any) => {
                    const isActive = activeSubtype === subtype && activeNumber === String(opt.number);
                    return (
                      <button
                        key={`${subtype}-${opt.number}`}
                        onClick={() => setType(subtype, opt.number !== null ? String(opt.number) : null)}
                        className={`${styles.filterPill} ${isActive ? styles.active : ''}`}
                      >
                        {SUBTYPE_LABELS[subtype] || subtype} N°{opt.number ?? '?'}
                        <span className={styles.count}>{opt.count}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          <div className={styles.densityToggle} role="group" aria-label="Density">
            <button
              onClick={() => setDensity('comfortable')}
              className={`${styles.densityBtn} ${!isCompact ? styles.active : ''}`}
              aria-label="Confortable"
              title="Confortable"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setDensity('compact')}
              className={`${styles.densityBtn} ${isCompact ? styles.active : ''}`}
              aria-label="Compact"
              title="Compact"
            >
              <Grid3x3 size={14} />
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

      <div
        className={styles.bentoGrid}
        style={isCompact ? { gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' } : undefined}
      >
        {items.length === 0 && !loading ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem 0', color: 'var(--muted)' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Aucun devoir pour ces filtres.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Essayez un autre trimestre ou un autre type.</p>
          </div>
        ) : (
          items.map((item, idx) => (
            <a
              key={item.id}
              href={`/fr/ressources/${item.numericId || item.id}/${item.slug}`}
              className={`${styles.bentoCard} ${idx === 0 ? styles.large : ''}`}
              style={{ contentVisibility: 'auto' }}
            >
              <SmartThumb
                src={item.thumbnailUrl}
                type={item.homeworkSubtype}
                homeworkNumber={item.homework_number ?? item.homeworkNumber}
                large={idx === 0}
              />
              <div className={styles.bentoCardBody}>
                <div className={styles.bentoMeta}>
                  <span className={styles.bentoTag}>{item.class?.nameFr || '—'}</span>
                  {item.homeworkSubtype && (
                    <span className={`${styles.bentoTag} ${styles.type}`}>
                      {SUBTYPE_LABELS[item.homeworkSubtype] || item.homeworkSubtype}
                      {item.homework_number ? ` N°${item.homework_number}` : ''}
                    </span>
                  )}
                </div>
                <h3 className={styles.bentoTitle}>{item.title}</h3>
                {item.summary && (
                  <p className={`${styles.bentoSummary} ${idx === 0 ? styles.bentoSummaryLarge : ''}`}>
                    {item.summary}
                  </p>
                )}
                <div className={styles.bentoFooter}>
                  <div className={styles.bentoStats}>
                    <span className={styles.bentoStat}><Eye size={12} /> {item.viewsCount || 0}</span>
                    <span className={styles.bentoStat}><Download size={12} /> {item.downloadsCount || 0}</span>
                    {item.avgRating > 0 && (
                      <span className={styles.bentoStat}><Star size={12} /> {(item.avgRating || 0).toFixed(1)}</span>
                    )}
                  </div>
                  {item.year && <span>{item.year}</span>}
                </div>
              </div>
            </a>
          ))
        )}

        {loading && items.length === 0 &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.bentoCard} style={{ contentVisibility: 'auto' }}>
              <div className={`${styles.skeleton} ${styles.bentoThumb}`} />
              <div className={styles.bentoCardBody}>
                <div className={styles.skeleton} style={{ height: 14, width: '40%' }} />
                <div className={styles.skeleton} style={{ height: 18, marginTop: 8 }} />
                <div className={styles.skeleton} style={{ height: 14, marginTop: 6, width: '80%' }} />
              </div>
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
            Chargement… {items.length} / {facets.total} ({percent}%)
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
    </>
  );
}

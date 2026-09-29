'use client';

/**
 * DevoirsListing — Pinterest-style masonry with infinite scroll + class tabs
 *
 * Used by /[locale]/devoirs/[slug] landing pages.
 * - Class tabs at top (Toutes, 7ème, 8ème, 9ème, 1AS, 2AS, 3AS, Bac)
 * - Click tab → updates URL + refetches with new class filter
 * - Initial 24 cards loaded server-side, infinite scroll loads +24 each time
 * - Masonry layout via CSS columns (variable card heights)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import ResourceCard from '@/components/resources/ResourceCard';
import { Loader2, BookOpen } from 'lucide-react';

interface DevoirsListingProps {
  subject: { slug: string; nameFr: string; color: string | null };
  classes: { slug: string; labelFr: string }[];
  initialItems: any[];
  initialTotal: number;
  initialNextCursor: number | null;
  initialClassSlug: string | null;
}

const PAGE_SIZE = 24;

export default function DevoirsListing({
  subject,
  classes,
  initialItems,
  initialTotal,
  initialNextCursor,
  initialClassSlug,
}: DevoirsListingProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeClass, setActiveClass] = useState<string | null>(initialClassSlug);
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Switch class tab → reset list + update URL
  const handleClassChange = useCallback(
    (slug: string | null) => {
      if (slug === activeClass) return;
      setActiveClass(slug);
      setItems([]);
      setNextCursor(null);
      // Update URL
      const params = new URLSearchParams(searchParams.toString());
      if (slug) {
        params.set('class', slug);
      } else {
        params.delete('class');
      }
      router.replace(`${pathname}${params.toString() ? '?' + params.toString() : ''}`, { scroll: false });
    },
    [activeClass, pathname, router, searchParams],
  );

  // Fetch next page
  const fetchNext = useCallback(async () => {
    if (loading || nextCursor === null) return;
    setLoading(true);
    try {
      const url = new URL(`/api/devoirs/${subject.slug}`, window.location.origin);
      if (activeClass) url.searchParams.set('class', activeClass);
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
  }, [activeClass, loading, nextCursor, subject.slug]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current) return;
    const sentinel = sentinelRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor !== null && !loading) {
          fetchNext();
        }
      },
      { rootMargin: '600px' }, // start fetching 600px before sentinel enters viewport
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [fetchNext, loading, nextCursor]);

  // Reset when class tab changes — fetch first page
  useEffect(() => {
    // Skip initial mount (already have initialItems)
    if (items.length === 0 && nextCursor === null && !loading) {
      // After class change → re-fetch first page
      const init = async () => {
        setLoading(true);
        try {
          const url = new URL(`/api/devoirs/${subject.slug}`, window.location.origin);
          if (activeClass) url.searchParams.set('class', activeClass);
          url.searchParams.set('cursor', '0');
          url.searchParams.set('limit', String(PAGE_SIZE));
          const r = await fetch(url.toString());
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          setItems(data.items || []);
          setNextCursor(data.nextCursor);
        } catch (e) {
          console.error('[DevoirsListing] init fetch failed:', e);
        } finally {
          setLoading(false);
        }
      };
      // Only run if items is empty AND we don't have initial data
      // (activeClass changed away from initialClassSlug)
      init();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClass]);

  const totalShown = items.length;

  return (
    <div>
      {/* CLASS TABS */}
      <div className="sticky top-16 z-30 bg-white/95 backdrop-blur border-y border-slate-200 -mx-4 px-4 mb-6">
        <div className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-thin">
          <button
            type="button"
            onClick={() => handleClassChange(null)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition ${
              activeClass === null
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Toutes les classes
            <span className="ms-2 text-xs opacity-70">({initialTotal})</span>
          </button>
          {classes.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => handleClassChange(c.slug)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition ${
                activeClass === c.slug
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {c.labelFr}
            </button>
          ))}
        </div>
      </div>

      {/* EMPTY STATE */}
      {totalShown === 0 && !loading && (
        <div className="text-center py-20">
          <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-700 mb-2">
            Aucun devoir {subject.nameFr} disponible
          </h2>
          <p className="text-sm text-slate-500">
            {activeClass
              ? `pour cette classe pour le moment.`
              : `pour le moment. Revenez bientôt !`}
          </p>
        </div>
      )}

      {/* MASONRY GRID — Pinterest-style via CSS columns */}
      {totalShown > 0 && (
        <div
          className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-5 [column-fill:_balance]"
          style={{ columnFill: 'balance' }}
        >
          {items.map((item) => (
            <div key={item.id} className="mb-5 break-inside-avoid">
              <ResourceCard resource={item} />
            </div>
          ))}
        </div>
      )}

      {/* INFINITE SCROLL SENTINEL + LOADER */}
      <div ref={sentinelRef} className="py-8 flex justify-center">
        {loading && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Chargement de plus de devoirs…</span>
          </div>
        )}
        {!loading && nextCursor === null && totalShown > 0 && (
          <p className="text-sm text-slate-500">
            ✓ Vous avez vu tous les {totalShown} devoirs disponibles.
          </p>
        )}
      </div>
    </div>
  );
}

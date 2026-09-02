'use client';

import { Link } from '@/i18n/navigation';
import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface SmartPaginationProps {
  /** Current page (1-based) */
  current: number;
  /** Total number of pages */
  total: number;
  /** Build URL for a given page number. If null, "go to page" jumps via router.push */
  buildHref?: (page: number) => string;
  /** Base path (used if buildHref is null) — e.g. `/matieres/mathematiques` */
  basePath?: string;
  /** Active filters (used to preserve query params) */
  activeFilters?: Record<string, string | undefined>;
  /** Show "Go to page" input */
  showJumpToPage?: boolean;
  /** Show "First / Last" buttons */
  showFirstLast?: boolean;
  /** Number of siblings around current (default 1) */
  siblingCount?: number;
  /** Optional className */
  className?: string;
}

/**
 * Build the list of page numbers and ellipsis markers to render.
 * Always shows first, last, current ± siblingCount, and ellipsis for gaps.
 */
function buildPageList(current: number, total: number, siblingCount: number): (number | 'ellipsis')[] {
  // If total pages is small, show all
  if (total <= 7 + siblingCount * 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, total);

  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < total - 1;

  const pages: (number | 'ellipsis')[] = [];

  // Always show first
  pages.push(1);

  if (showLeftDots) {
    pages.push('ellipsis');
  } else {
    // Fill in pages between 1 and leftSibling
    for (let i = 2; i < leftSibling; i++) pages.push(i);
  }

  // Window around current
  for (let i = leftSibling; i <= rightSibling; i++) {
    if (i !== 1 && i !== total) pages.push(i);
  }

  if (showRightDots) {
    pages.push('ellipsis');
  } else {
    // Fill in pages between rightSibling and total
    for (let i = rightSibling + 1; i < total; i++) pages.push(i);
  }

  // Always show last
  if (total > 1) pages.push(total);

  return pages;
}

export default function SmartPagination({
  current,
  total,
  buildHref,
  basePath,
  activeFilters = {},
  showJumpToPage = true,
  showFirstLast = true,
  siblingCount = 1,
  className = '',
}: SmartPaginationProps) {
  const router = useRouter();
  const [jumpValue, setJumpValue] = useState('');

  // Build URL for a given page
  const makeHref = useCallback(
    (p: number) => {
      if (buildHref) return buildHref(p);
      const params = new URLSearchParams();
      Object.entries(activeFilters).forEach(([k, v]) => {
        if (v && k !== 'page') params.set(k, v);
      });
      if (p > 1) params.set('page', String(p));
      const query = params.toString();
      return `${basePath || ''}${query ? `?${query}` : ''}`;
    },
    [buildHref, basePath, activeFilters],
  );

  if (total <= 1) return null;

  const pages = buildPageList(current, total, siblingCount);

  // Jump to page
  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpValue, 10);
    if (p >= 1 && p <= total && p !== current) {
      if (buildHref === undefined && basePath) {
        router.push(makeHref(p));
      } else {
        window.location.href = makeHref(p);
      }
    }
    setJumpValue('');
  };

  return (
    <nav
      aria-label="Pagination"
      className={`mt-8 flex flex-col items-center gap-3 ${className}`}
    >
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {/* First page */}
        {showFirstLast && current > 2 && (
          <Link
            href={makeHref(1)}
            aria-label="Première page"
            className="min-w-[36px] h-9 px-2 flex items-center justify-center rounded-lg text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Link>
        )}

        {/* Prev */}
        {current > 1 && (
          <Link
            href={makeHref(current - 1)}
            aria-label="Page précédente"
            className="min-w-[36px] h-9 px-3 flex items-center gap-1 rounded-lg text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Précédent</span>
          </Link>
        )}

        {/* Page numbers + ellipsis */}
        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <span
              key={`e-${idx}`}
              aria-hidden="true"
              className="min-w-[36px] h-9 px-2 flex items-center justify-center text-sm text-slate-400 select-none"
            >
              …
            </span>
          ) : (
            <Link
              key={p}
              href={makeHref(p)}
              aria-label={`Page ${p}`}
              aria-current={p === current ? 'page' : undefined}
              className={`min-w-[36px] h-9 px-3 flex items-center justify-center rounded-lg text-sm font-semibold transition ${
                p === current
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {p}
            </Link>
          ),
        )}

        {/* Next */}
        {current < total && (
          <Link
            href={makeHref(current + 1)}
            aria-label="Page suivante"
            className="min-w-[36px] h-9 px-3 flex items-center gap-1 rounded-lg text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
          >
            <span className="hidden sm:inline">Suivant</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}

        {/* Last page */}
        {showFirstLast && current < total - 1 && (
          <Link
            href={makeHref(total)}
            aria-label="Dernière page"
            className="min-w-[36px] h-9 px-2 flex items-center justify-center rounded-lg text-sm font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
          >
            <ChevronsRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Page X of Y + jump to page */}
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>
          Page <strong className="text-slate-700">{current}</strong> sur{' '}
          <strong className="text-slate-700">{total}</strong>
        </span>

        {showJumpToPage && total > 5 && (
          <>
            <span aria-hidden="true">·</span>
            <form onSubmit={handleJump} className="flex items-center gap-1">
              <label htmlFor="jump-to-page" className="sr-only">
                Aller à la page
              </label>
              <span>Aller à</span>
              <input
                id="jump-to-page"
                type="number"
                min={1}
                max={total}
                value={jumpValue}
                onChange={(e) => setJumpValue(e.target.value)}
                placeholder="#"
                className="w-14 h-8 px-2 text-center text-sm font-semibold rounded border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={!jumpValue}
                className="h-8 px-2 rounded text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                OK
              </button>
            </form>
          </>
        )}
      </div>
    </nav>
  );
}

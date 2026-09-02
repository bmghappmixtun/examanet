'use client';
/**
 * PDFSidebar — left sidebar with page thumbnails + outline.
 *
 * Desktop only (hidden < 1024px). Mobile can still scroll through all pages
 * with the existing continuous mode + scroll spy. The sidebar is a UX
 * accelerator for desktop users who want to jump to a specific page or
 * navigate via the PDF's internal outline (TOC).
 *
 * - Renders N page thumbnails at low resolution via PDF.js canvas
 * - Lazy-renders only visible thumbs via IntersectionObserver
 * - LRU cache (24 most recent thumbs in memory)
 * - Click thumb → jump to page via callback
 * - Outline from doc.getOutline() if PDF has a TOC
 *
 * Parent <PDFViewer> passes the loaded pdfjs document + the current page
 * + a jumpTo callback. We do not own the PDF state.
 */

import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { ChevronDown, List, X } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const THUMB_W = 200; // thumbnail width in CSS px
const LRU_MAX = 24;

interface PDFSidebarProps {
  pdf: PDFDocumentProxy | null;
  currentPage: number;
  onJump: (page: number) => void;
  onClose: () => void;
  // Pages to skip rendering (saves memory on huge docs)
  maxRenderedThumbs?: number;
}

interface ThumbData {
  page: number;
  url: string;
  width: number;
  height: number;
}

interface OutlineItem {
  title: string;
  page: number; // resolved page number
  items?: OutlineItem[];
}

export default memo(function PDFSidebar({
  pdf,
  currentPage,
  onJump,
  onClose,
  maxRenderedThumbs = 100,
}: PDFSidebarProps) {
  const [thumbs, setThumbs] = useState<Map<number, ThumbData>>(new Map());
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [tab, setTab] = useState<'pages' | 'outline'>('pages');
  const thumbRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderQueue = useRef<Set<number>>(new Set());

  // ==========================================================================
  // Render a single thumbnail to a canvas, then store as data URL
  // ==========================================================================
  const renderThumb = useMemo(() => {
    return async (pageNum: number) => {
      if (!pdf || renderQueue.current.has(pageNum)) return;
      renderQueue.current.add(pageNum);
      try {
        const page = await pdf.getPage(pageNum);
        const baseVp = page.getViewport({ scale: 1 });
        const scale = (THUMB_W / baseVp.width) * (window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        // Convert to JPEG data URL (smaller than PNG for thumbs)
        const url = canvas.toDataURL('image/jpeg', 0.7);
        setThumbs((prev) => {
          const next = new Map(prev);
          next.set(pageNum, {
            page: pageNum,
            url,
            width: baseVp.width,
            height: baseVp.height,
          });
          // LRU eviction (FIFO for simplicity — we render in order)
          if (next.size > LRU_MAX) {
            const firstKey = next.keys().next().value;
            if (firstKey !== undefined) next.delete(firstKey);
          }
          return next;
        });
      } catch (e) {
        // Silently skip — thumb generation is best-effort
      } finally {
        renderQueue.current.delete(pageNum);
      }
    };
  }, [pdf]);

  // ==========================================================================
  // IntersectionObserver: lazy-render visible thumbs
  // ==========================================================================
  useEffect(() => {
    if (!pdf) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const pageNum = Number((e.target as HTMLElement).dataset.page);
            if (pageNum && !thumbs.has(pageNum)) {
              void renderThumb(pageNum);
            }
          }
        }
      },
      { root: null, rootMargin: '200px', threshold: 0.01 },
    );
    thumbRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pdf, thumbs, renderThumb]);

  // ==========================================================================
  // Fetch outline (PDF's internal TOC) on PDF load
  // ==========================================================================
  useEffect(() => {
    if (!pdf) {
      setOutline(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await pdf.getOutline();
        if (cancelled || !raw) return;
        // Resolve destination.pageNumber for each item recursively
        const resolve = async (items: any[]): Promise<OutlineItem[]> => {
          const out: OutlineItem[] = [];
          for (const item of items) {
            let page = 0;
            try {
              const dest = item.dest;
              const ref =
                typeof dest === 'string'
                  ? (await pdf.getDestination(dest))?.[0]
                  : Array.isArray(dest)
                    ? dest[0]
                    : null;
              if (ref && typeof ref === 'object' && 'num' in ref) {
                const idx = await pdf.getPageIndex(ref as any);
                page = idx + 1;
              }
            } catch {
              // ignore
            }
            const children = item.items ? await resolve(item.items) : undefined;
            out.push({ title: item.title, page, items: children });
          }
          return out;
        };
        const resolved = await resolve(raw);
        if (!cancelled) setOutline(resolved);
      } catch {
        if (!cancelled) setOutline([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  // ==========================================================================
  // Auto-scroll the current thumb into view
  // ==========================================================================
  useEffect(() => {
    const el = thumbRefs.current.get(currentPage);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentPage]);

  if (!pdf) return null;

  const totalPages = pdf.numPages;
  const pagesToRender = Math.min(totalPages, maxRenderedThumbs);

  return (
    <aside
      className="pdf-sidebar fixed left-0 top-0 bottom-0 z-30 w-60 bg-white border-r border-slate-200 shadow-xl flex flex-col"
      aria-label="Navigation latérale du PDF"
    >
      {/* Tabs */}
      <div className="flex items-center border-b border-slate-200 px-2 pt-2">
        <button
          onClick={() => setTab('pages')}
          className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-t-lg transition ${
            tab === 'pages'
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Pages
        </button>
        <button
          onClick={() => setTab('outline')}
          disabled={!outline || outline.length === 0}
          className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-t-lg transition flex items-center justify-center gap-1 ${
            tab === 'outline'
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          <List className="w-3 h-3" /> Plan
        </button>
        <button
          onClick={onClose}
          className="ml-1 p-1.5 hover:bg-slate-100 rounded-lg transition"
          aria-label="Fermer la barre latérale"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tab === 'pages' &&
          Array.from({ length: pagesToRender }, (_, i) => i + 1).map((p) => {
            const isCurrent = p === currentPage;
            const data = thumbs.get(p);
            return (
              <div
                key={p}
                ref={(el) => {
                  if (el) thumbRefs.current.set(p, el);
                  else thumbRefs.current.delete(p);
                }}
                data-page={p}
                onClick={() => onJump(p)}
                className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                  isCurrent
                    ? 'border-primary-500 ring-2 ring-primary-200 shadow-md'
                    : 'border-transparent hover:border-slate-300'
                }`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onJump(p);
                  }
                }}
              >
                {data ? (
                  <img
                    src={data.url}
                    alt={`Page ${p}`}
                    className="w-full h-auto block bg-slate-50"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="w-full bg-slate-100 animate-pulse"
                    style={{ aspectRatio: '0.707' }}
                  />
                )}
                <div
                  className={`absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    isCurrent
                      ? 'bg-primary-500 text-white'
                      : 'bg-slate-900/80 text-white'
                  }`}
                >
                  {p}
                </div>
              </div>
            );
          })}

        {tab === 'outline' && outline && <OutlineList items={outline} onJump={onJump} />}

        {tab === 'outline' && (!outline || outline.length === 0) && (
          <div className="text-center text-sm text-slate-400 py-12 px-4">
            Ce PDF n'a pas de sommaire interne.
          </div>
        )}

        {tab === 'pages' && totalPages > maxRenderedThumbs && (
          <div className="text-center text-xs text-slate-400 py-2">
            Affichage limité aux {maxRenderedThumbs} premières pages.
          </div>
        )}
      </div>
    </aside>
  );
});

// Recursive outline list
function OutlineList({
  items,
  onJump,
  depth = 0,
}: {
  items: OutlineItem[];
  onJump: (page: number) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? 'space-y-1' : 'pl-3 mt-1 space-y-1 border-l border-slate-200'}>
      {items.map((item, i) => (
        <OutlineRow key={`${depth}-${i}`} item={item} onJump={onJump} depth={depth} />
      ))}
    </ul>
  );
}

function OutlineRow({
  item,
  onJump,
  depth,
}: {
  item: OutlineItem;
  onJump: (page: number) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = item.items && item.items.length > 0;
  return (
    <li>
      <div
        className="flex items-start gap-1 hover:bg-slate-100 rounded px-1.5 py-1 transition group"
        style={{ paddingLeft: depth * 4 + 6 }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="p-0.5 hover:bg-slate-200 rounded mt-0.5"
            aria-label={open ? 'Replier' : 'Déplier'}
          >
            <ChevronDown
              className={`w-3 h-3 text-slate-500 transition-transform ${open ? '' : '-rotate-90'}`}
            />
          </button>
        ) : (
          <span className="w-3 h-3 mt-1.5 inline-block" />
        )}
        {item.page > 0 ? (
          <button
            onClick={() => onJump(item.page)}
            className="flex-1 text-left text-sm text-slate-700 hover:text-primary-600 leading-tight"
          >
            {item.title}
            <span className="ml-1 text-xs text-slate-400">p.{item.page}</span>
          </button>
        ) : (
          <span className="flex-1 text-sm text-slate-500 leading-tight">{item.title}</span>
        )}
      </div>
      {hasChildren && open && <OutlineList items={item.items!} onJump={onJump} depth={depth + 1} />}
    </li>
  );
}

'use client';
import { useState, useCallback, useEffect, useRef, Component, ReactNode } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileWarning,
  Maximize,
  Minimize,
  Search,
  X,
  Copy,
  Check,
  Rows3,
  Square,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react';
import PDFSidebar from './PDFSidebar';

// ============================================================================
// PDF.js Worker setup
// ============================================================================
// Use a local worker file served from the same origin. This avoids:
// - CORS issues with cross-origin workers
// - Network failures (worker loads from same CDN as the app)
// - Version mismatches (we copy the worker that matches pdfjs-dist version)
if (typeof window !== 'undefined' && pdfjs?.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

// ============================================================================
// Constants
// ============================================================================
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

type FitMode = 'width' | 'height' | 'page' | 'manual';
type ViewMode = 'single' | 'continuous';

// ============================================================================
// Error boundary for individual page layers
// If the text/annotation layer crashes (e.g. on PDFs with bad fonts),
// the boundary catches it and the parent auto-disables these layers.
// The canvas (visual rendering) keeps working.
// ============================================================================
class PageLayerBoundary extends Component<
  { children: ReactNode; onLayerError: () => void; label: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn(`[PDF] ${this.props.label} layer crashed (auto-disabled):`, error.message);
    this.props.onLayerError();
  }

  render() {
    if (this.state.hasError) {
      // Render children without the crashed layer
      return this.props.children;
    }
    return this.props.children;
  }
}

// ============================================================================
// Document-level error boundary
// Catches catastrophic errors (e.g. invalid PDF, network failure)
// ============================================================================
class DocumentErrorBoundary extends Component<
  { children: ReactNode; onError: (msg: string) => void },
  { hasError: boolean; error: string | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[PDF] Document error:', error);
    this.props.onError(error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center max-w-md">
            <FileWarning className="w-12 h-12 mx-auto mb-3 text-red-500" />
            <h3 className="font-bold text-lg mb-2">Impossible de charger le PDF</h3>
            <p className="text-sm text-slate-500 mb-4">{this.state.error || 'Erreur inconnue'}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface PDFViewerProps {
  url: string;
  fileName?: string;
  initialPage?: number;
  onDownload?: () => void;
  className?: string;
}

export default function PDFViewer({
  url,
  fileName,
  initialPage = 1,
  onDownload,
  className = '',
}: PDFViewerProps) {
  // ==========================================================================
  // State
  // ==========================================================================
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1);
  // UX FIX: default to 'width' (page fills container width, good for reading)
  // The container is now tall enough (95vh + 800px min) to fit most pages
  // entirely in height too — so the user sees the full first page without scrolling.
  const [fitMode, setFitMode] = useState<FitMode>('width');
  // View mode: 'single' = 1 page at a time (prev/next), 'continuous' = scroll all pages
  const [viewMode, setViewMode] = useState<ViewMode>('continuous');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [containerHeight, setContainerHeight] = useState<number>(600);
  // 2026-08-18 — PDF loading UX (Niveau 4 polish):
  // - loadProgress: 0-1, reported by react-pdf Document onProgress
  // - readingProgress: 0-1, scroll position vs scrollable height
  // - renderingPages: Set of page numbers currently being rendered
  // - isSlowConnection: true if the initial load takes > 8s
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [readingProgress, setReadingProgress] = useState<number>(0);
  const [renderingPages, setRenderingPages] = useState<Set<number>>(new Set());
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  // 2026-08-19: Fake progress so the user always sees a percentage turning,
  // even when react-pdf's onLoadProgress doesn't fire (cached PDFs, fast
  // CDN, small files). Without this, the UI shows 0% the whole time which
  // feels broken. We increment from 0 → 90% in 8s with an ease curve,
  // then snap to 100% when the real loadProgress reaches 1.
  const [fakeProgress, setFakeProgress] = useState<number>(0);
  const fakeProgressStartedAt = useRef<number | null>(null);
  const fakeProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (fakeProgressTimer.current) {
      clearInterval(fakeProgressTimer.current);
      fakeProgressTimer.current = null;
    }
    if (loading) {
      fakeProgressStartedAt.current = Date.now();
      setFakeProgress(0);
      // Tick every 80ms. Target 90% in 8s = ~0.9% per tick.
      fakeProgressTimer.current = setInterval(() => {
        const start = fakeProgressStartedAt.current || Date.now();
        const elapsed = (Date.now() - start) / 1000; // seconds
        // Ease-out curve: 0% at 0s, ~70% at 4s, ~90% at 8s
        const pct = Math.min(0.9, 0.9 * (1 - Math.exp(-elapsed / 3)));
        setFakeProgress(pct);
      }, 80);
    } else {
      setFakeProgress(1);
    }
    return () => {
      if (fakeProgressTimer.current) {
        clearInterval(fakeProgressTimer.current);
        fakeProgressTimer.current = null;
      }
    };
  }, [loading]);
  const [pageNaturalSize, setPageNaturalSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  // Sidebar (thumbnails + outline) — desktop only, hidden < 1024px
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false); // hidden by default (2026-08-16)
  // pdfjs document reference (for the sidebar — needs getOutline/getPage for thumbs)
  const pdfDocRef = useRef<any>(null);

  // ==========================================================================
  // TanStack Virtual — only render visible pages in continuous mode
  // (massive perf win on 30+ page PDFs; without this, every page in the
  // document is mounted in the React tree, even if it's off-screen)
  // ==========================================================================
  const virtualizer = useVirtualizer({
    count: numPages || 0,
    // 2026-08-16: use containerRef (the actual scrolling element with
    // overflow-auto) instead of scrollRef. The inner scrollRef div does
    // NOT scroll itself — the parent containerRef does. Using scrollRef
    // meant the virtualizer never detected scrolls, never mounted the
    // right pages, and the scroll spy never fired. Same root cause as
    // the broken prev/next arrows in continuous mode.
    getScrollElement: () => containerRef.current,
    // 2026-08-17: dynamic estimate based on the current container width.
    // A4 portrait ratio is ~1.414 (height/width). On mobile, the
    // container is narrow so pages are shorter; on desktop wider.
    // Using a fixed 1100px caused huge empty gaps between pages on
    // mobile (user feedback 2026-08-17).
    estimateSize: () => Math.max(200, containerWidth * 1.414 + 32),
    overscan: 3, // render 3 pages above/below viewport for smooth scroll
    enabled: viewMode === 'continuous',
  });

  // Layer enablement — auto-disabled on error
  const [textLayerEnabled, setTextLayerEnabled] = useState(true);
  const [annotationLayerEnabled, setAnnotationLayerEnabled] = useState(true);
  const [textLayerError, setTextLayerError] = useState(false);

  // Search & copy
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ count: number; active: number }>({
    count: 0,
    active: 0,
  });
  const [copySuccess, setCopySuccess] = useState(false);

  // Worker error tracking
  const [workerReady, setWorkerReady] = useState(true);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  // Shell ref — used for fullscreen so the floating bottom toolbar
  // stays available when the viewer is in fullscreen mode. Previously
  // we fullscreened the inner PDF container only, which left the
  // toolbar behind in the normal layout (2026-08-16).
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Touch state for swipe detection (next/previous page on horizontal swipe)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number; time: number } | null>(null);
  // Pinch-to-zoom state (2-finger gesture on mobile)
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number | null>(null);
  // Scroll spy refs (continuous mode)
  const isScrollSpyUpdate = useRef(false);
  const pageRefsMap = useRef<Map<number, HTMLDivElement | null>>(new Map());

  // ==========================================================================
  // 2026-08-18 — Slow connection detection (Niveau 4 polish).
  // If the document takes more than 8s to load, show a "slow
  // connection" warning. The timer is reset on each retry.
  // ==========================================================================
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setIsSlowConnection(true), 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  // ==========================================================================
  // Scroll spy — track current page in continuous mode
  // ==========================================================================
  useEffect(() => {
    if (viewMode !== 'continuous') return;
    // 2026-08-16: listen on containerRef (the actual scrolling element)
    // not scrollRef. scrollRef is a child div that does NOT scroll —
    // the parent containerRef with overflow-auto is what scrolls.
    const el = containerRef.current;
    if (!el || !numPages) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (isScrollSpyUpdate.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // 2026-08-18: also update the reading progress bar
        // (scroll position / scrollable height, 0-1)
        const scrollable = el.scrollHeight - el.clientHeight;
        if (scrollable > 0) {
          const progress = Math.min(1, Math.max(0, el.scrollTop / scrollable));
          setReadingProgress(progress);
        }
        // Use getBoundingClientRect for accurate viewport-relative
        // positions. The viewport center is the center of containerRef
        // in the viewport. Each card's center is its own rect's center.
        const elRect = el.getBoundingClientRect();
        const viewportCenter = elRect.top + el.clientHeight / 2;
        let closest = 1, minDist = Infinity;
        for (let i = 1; i <= numPages; i++) {
          const card = pageRefsMap.current.get(i);
          if (!card) continue;
          const cardRect = card.getBoundingClientRect();
          const cardCenter = cardRect.top + cardRect.height / 2;
          const dist = Math.abs(viewportCenter - cardCenter);
          if (dist < minDist) { minDist = dist; closest = i; }
        }
        if (closest !== pageNumber) {
          isScrollSpyUpdate.current = true;
          setPageNumber(closest);
          // Reset flag after a tick (avoid re-trigger from page change)
          requestAnimationFrame(() => { isScrollSpyUpdate.current = false; });
        }
      }, 80);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [viewMode, numPages, pageNumber]);

  // ==========================================================================
  // Document options — self-hosted assets, no unpkg dependency
  // ==========================================================================
  const documentOptions = useRef({
    cMapUrl: '/pdf-assets/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdf-assets/standard_fonts/',
    // Don't try to use eval (CSP-friendly)
    isEvalSupported: false,
    // Disable streaming for simpler error handling
    disableStream: false,
    disableRange: false,
    // Verbose error logging
    verbosity: 0,
  }).current;

  // ==========================================================================
  // Container size tracking
  // ==========================================================================
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 32);
        setContainerHeight(containerRef.current.clientHeight - 32);
      }
    };
    update();
    window.addEventListener('resize', update);

    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [isFullscreen]);

  // ==========================================================================
  // Fit mode → scale
  // ==========================================================================
  useEffect(() => {
    if (!pageNaturalSize) return;

    let newScale = scale;
    if (fitMode === 'width' && pageNaturalSize.width > 0) {
      newScale = containerWidth / pageNaturalSize.width;
    } else if (fitMode === 'height' && pageNaturalSize.height > 0) {
      newScale = containerHeight / pageNaturalSize.height;
    } else if (fitMode === 'page') {
      const scaleW = containerWidth / pageNaturalSize.width;
      const scaleH = containerHeight / pageNaturalSize.height;
      newScale = Math.min(scaleW, scaleH) * 0.95;
    }

    if (fitMode !== 'manual') {
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      setScale(newScale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitMode, containerWidth, containerHeight, pageNaturalSize]);

  // ==========================================================================
  // Fullscreen
  // ==========================================================================
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ==========================================================================
  // Keyboard navigation
  // ==========================================================================
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!numPages) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          setPageNumber((p) => Math.min(numPages, p + 1));
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          setPageNumber((p) => Math.max(1, p - 1));
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          fitToWidth();
          break;
        case 'Home':
          e.preventDefault();
          setPageNumber(1);
          break;
        case 'End':
          e.preventDefault();
          setPageNumber(numPages);
          break;
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) toggleFullscreen();
          break;
        case 's':
        case 'S':
          // 2026-08-17: Niveau 1.4 — keyboard shortcut to toggle sidebar
          if (!e.ctrlKey && !e.metaKey) setSidebarOpen((o) => !o);
          break;
        case 'Escape':
          // 2026-08-17: Niveau 1.4 — close sidebar first, then exit fullscreen
          if (sidebarOpen) {
            setSidebarOpen(false);
            e.preventDefault();
          } else if (isFullscreen) {
            document.exitFullscreen().catch(() => {});
            e.preventDefault();
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages]);

  // ==========================================================================
  // Search
  // ==========================================================================
  useEffect(() => {
    if (!searchOpen) {
      const marks = document.querySelectorAll('.pdf-search-mark, .pdf-search-current');
      marks.forEach((m) => {
        const parent = m.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(m.textContent || ''), m);
          parent.normalize();
        }
      });
      setSearchResults({ count: 0, active: 0 });
      return;
    }
    if (!searchQuery.trim()) {
      setSearchResults({ count: 0, active: 0 });
      return;
    }
    const timer = setTimeout(() => {
      const textLayer = document.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) {
        setSearchResults({ count: 0, active: 0 });
        return;
      }
      const text = textLayer.textContent || '';
      const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = text.match(regex);
      setSearchResults({
        count: matches?.length || 0,
        active: 1,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, pageNumber]);

  // ==========================================================================
  // Callbacks
  // ==========================================================================
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await shellRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen error:', e);
    }
  }, []);

  const zoomIn = useCallback(() => {
    setFitMode('manual');
    setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  }, []);

  const zoomOut = useCallback(() => {
    setFitMode('manual');
    setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
  }, []);

  const fitToWidth = useCallback(() => {
    setFitMode('width');
  }, []);

  const fitToPage = useCallback(() => {
    setFitMode('page');
  }, []);

  const prevPage = useCallback(() => {
    setPageNumber((p) => Math.max(1, p - 1));
  }, []);

  const nextPage = useCallback(() => {
    setPageNumber((p) => Math.min(numPages || 1, p + 1));
  }, [numPages]);

  const onLoadSuccess = useCallback((pdf: any) => {
    pdfDocRef.current = pdf;
    setNumPages(pdf.numPages);
    setLoading(false);
    setError(null);
    setWorkerReady(true);
    setLoadProgress(1);
    setIsSlowConnection(false);
  }, []);

  const onLoadError = useCallback((err: Error) => {
    console.error('[PDF] load error:', err);
    setError(err?.message || 'Erreur de chargement');
    setLoading(false);
    setWorkerReady(false);
  }, []);

  // 2026-08-18: react-pdf Document onLoadProgress callback
  // (loaded bytes / total bytes, 0-1). Note: this only fires when
  // the PDF is being downloaded over the network. If the file is
  // already in the browser cache, the load is instant and the
  // callback never fires — loadProgress stays at 0 until onLoadSuccess.
  // The UI handles this by showing a generic "Chargement…" label
  // when progress is still 0 after a brief moment.
  const onLoadProgress = useCallback(({ loaded, total }: { loaded: number; total: number }) => {
    if (total > 0) {
      setLoadProgress(Math.min(1, loaded / total));
    }
  }, []);

  const onPageLoadSuccess = useCallback((page: any) => {
    try {
      const viewport = page.getViewport({ scale: 1 });
      setPageNaturalSize({ width: viewport.width, height: viewport.height });
      // 2026-08-17: tell the virtualizer to remeasure the page so the
      // total size matches the actual rendered height (not the estimate).
      // Without this, there are large empty gaps between pages on mobile.
      virtualizer.measure();
      // 2026-08-18: mark this page as no longer rendering
      setRenderingPages((prev) => {
        if (!prev.has(page.pageNumber)) return prev;
        const next = new Set(prev);
        next.delete(page.pageNumber);
        return next;
      });
    } catch (e) {
      console.warn('[PDF] Could not capture page size:', e);
    }
  }, [virtualizer]);

  // 2026-08-18: track pages that start rendering (so the "Rendu page X/N"
  // indicator knows what's pending). Called before the page actually renders.
  const onPageRenderStart = useCallback((pageNum: number) => {
    setRenderingPages((prev) => {
      if (prev.has(pageNum)) return prev;
      const next = new Set(prev);
      next.add(pageNum);
      return next;
    });
  }, []);

  // 2026-08-18: when pageNumber changes (user nav or scroll spy),
  // mark the new page as rendering. The Page component will then
  // remove it from the set once it finishes rendering.
  useEffect(() => {
    if (pageNumber && numPages) {
      onPageRenderStart(pageNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, numPages]);

  const handleCopy = useCallback(async () => {
    const selection = window.getSelection();
    if (selection && selection.toString()) {
      try {
        await navigator.clipboard.writeText(selection.toString());
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch {
        // Fallback
      }
    }
  }, []);

  // Layer error handlers (auto-disable on crash)
  const onTextLayerError = useCallback(() => {
    console.warn('[PDF] Disabling text layer (font/render issue)');
    setTextLayerEnabled(false);
    setTextLayerError(true);
  }, []);

  const onAnnotationLayerError = useCallback(() => {
    console.warn('[PDF] Disabling annotation layer');
    setAnnotationLayerEnabled(false);
  }, []);

  // Reset layers when URL changes
  useEffect(() => {
    setTextLayerEnabled(true);
    setAnnotationLayerEnabled(true);
    setTextLayerError(false);
    setError(null);
    setLoading(true);
    setNumPages(null);
    setPageNumber(1);
    // Reset scroll position to top on URL change
    // 2026-08-16: scroll the actual scrolling element (containerRef),
    // not scrollRef (which doesn't scroll itself).
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [url]);

  // Scroll to the manually-set page (jump via input, prev/next, keyboard)
  // Only active in continuous mode. We use a ref flag to prevent the scroll
  // spy from immediately overriding the page back to the previous value.
  useEffect(() => {
    if (viewMode !== 'continuous' || !numPages) return;
    if (isScrollSpyUpdate.current) return;
    const card = pageRefsMap.current.get(pageNumber);
    // 2026-08-16: scroll the actual scrolling element (containerRef),
    // not scrollRef. Also add 16px offset to account for scrollRef's
    // p-4 padding-top (the virtualizer container starts 16px below
    // containerRef's content top).
    const scrollEl = containerRef.current;
    if (card && scrollEl) {
      const start = (card as any).__virtualStart ?? 0;
      scrollEl.scrollTo({ top: start + 16 - 16, behavior: 'smooth' });
    }
  }, [pageNumber, viewMode, numPages]);

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div
      ref={shellRef}
      className={`pdf-viewer-shell relative bg-white overflow-hidden ${className} ${
        isFullscreen
          ? 'rounded-none border-0 shadow-none'
          : 'rounded-2xl border border-slate-200 shadow-sm'
      }`}
    >
      {/* === READING PROGRESS BAR (Niveau 4, 2026-08-18) === */}
      {/* Thin gradient bar at the very top of the viewer. Shows scroll
          progress through the document. Click anywhere on it to jump. */}
      <div
        className="absolute top-0 left-0 right-0 h-1 bg-slate-100 z-30 cursor-pointer"
        onClick={(e) => {
          // 2026-08-18: click on the progress bar to jump to that
          // position in the document
          if (!containerRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const target = ratio * (containerRef.current.scrollHeight - containerRef.current.clientHeight);
          containerRef.current.scrollTo({ top: target, behavior: 'smooth' });
        }}
        role="progressbar"
        aria-valuenow={Math.round(readingProgress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progression de lecture"
      >
        <div
          className="h-full bg-gradient-to-r from-primary-500 via-fuchsia-500 to-amber-500 transition-[width] duration-100"
          style={{ width: `${Math.round(readingProgress * 100)}%` }}
        />
      </div>
      {/* === SIDEBAR (desktop only) === */}
      {sidebarOpen && !isFullscreen && (
        <div className="hidden lg:block">
          <PDFSidebar
            pdf={pdfDocRef.current}
            currentPage={pageNumber}
            onJump={(p) => {
              // 2026-08-16: scroll containerRef (the actual scrolling
              // element), not scrollRef.
              if (viewMode === 'continuous' && containerRef.current) {
                const card = pageRefsMap.current.get(p);
                if (card) {
                  const start = (card as any).__virtualStart ?? 0;
                  containerRef.current.scrollTo({ top: start + 16 - 16, behavior: 'smooth' });
                }
              } else {
                setPageNumber(p);
              }
            }}
            onClose={() => setSidebarOpen(false)}
            maxRenderedThumbs={150}
          />
        </div>
      )}

      {/* === FLOATING BOTTOM TOOLBAR (glass, Scribd-style) === */}
      <div
        className={`pdf-viewer-floater absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white rounded-full px-1.5 py-1.5 shadow-2xl flex items-center gap-0.5 ring-1 ring-white/10 ${sidebarOpen && !isFullscreen ? 'lg:ml-30' : ''}`}
      >
        {/* Page navigation */}
        <button
          type="button"
          onClick={prevPage}
          disabled={!numPages || pageNumber <= 1}
          className="w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-90"
          title="Page précédente (←)"
          aria-label="Page précédente"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="px-2.5 h-10 text-sm font-bold font-mono tabular-nums min-w-[92px] flex items-center justify-center gap-0.5 whitespace-nowrap">
          {numPages ? (
            <>
              {/* 2026-08-18: page loader indicator — shows a small spinner
                  when the current page is still being rendered */}
              {renderingPages.has(pageNumber) && (
                <Loader2 className="w-3 h-3 text-primary-300 animate-spin mr-1" />
              )}
              <input
                type="number"
                min={1}
                max={numPages}
                value={pageNumber}
                onChange={(e) => {
                  const p = parseInt(e.target.value);
                  if (p >= 1 && p <= numPages) setPageNumber(p);
                }}
                className="w-8 bg-transparent text-center text-white rounded outline-none focus:bg-white/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none px-0 py-0 m-0 text-sm font-bold"
                aria-label="Numéro de page"
              />
              <span className="text-slate-500">/</span>
              <span className="text-slate-400">{numPages}</span>
            </>
          ) : (
            <span className="text-slate-400">…</span>
          )}
        </div>
        <button
          type="button"
          onClick={nextPage}
          disabled={!numPages || pageNumber >= numPages}
          className="w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-90"
          title="Page suivante (→)"
          aria-label="Page suivante"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-white/15 mx-1" />

        {/* Zoom out */}
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          className="w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-90"
          title="Zoom arrière (-)"
          aria-label="Zoom arrière"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        {/* Zoom level / fit-to-width toggle */}
        <button
          type="button"
          onClick={fitToWidth}
          className={`px-2 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full text-xs font-mono min-w-[60px] transition active:scale-90 ${fitMode === 'width' ? 'bg-white/20' : ''}`}
          title="Ajuster à la largeur (0)"
          aria-label="Ajuster à la largeur"
        >
          {fitMode === 'manual' ? `${Math.round(scale * 100)}%` : '⤢ Auto'}
        </button>
        {/* Zoom in */}
        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          className="w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition active:scale-90"
          title="Zoom avant (+)"
          aria-label="Zoom avant"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        {/* Fit to page */}
        <button
          type="button"
          onClick={fitToPage}
          className={`w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full transition active:scale-90 ${fitMode === 'page' ? 'bg-white/20' : ''}`}
          title="Ajuster à la page"
          aria-label="Ajuster à la page"
        >
          {fitMode === 'page' ? (
            <Minimize className="w-4 h-4" />
          ) : (
            <Maximize className="w-4 h-4" />
          )}
        </button>
        {/* View mode toggle: single page vs continuous scroll */}
        <button
          type="button"
          onClick={() => setViewMode((m) => (m === 'single' ? 'continuous' : 'single'))}
          className={`w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full transition active:scale-90 ${viewMode === 'continuous' ? 'bg-white/20' : ''}`}
          title={viewMode === 'continuous' ? 'Mode page par page' : 'Mode scroll continu'}
          aria-label="Changer le mode d'affichage"
        >
          {viewMode === 'continuous' ? (
            <Square className="w-4 h-4" />
          ) : (
            <Rows3 className="w-4 h-4" />
          )}
        </button>
        {/* Sidebar toggle (desktop only — hidden < 1024px via CSS) */}
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="w-10 h-10 hidden lg:inline-flex items-center justify-center hover:bg-white/10 rounded-full transition active:scale-90"
          title={sidebarOpen ? 'Masquer la barre latérale' : 'Afficher la barre latérale'}
          aria-label="Barre latérale"
        >
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-white/15 mx-1" />

        {/* Search */}
        <button
          type="button"
          onClick={() => setSearchOpen((o) => !o)}
          className={`w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full transition active:scale-90 ${searchOpen ? 'bg-white/20' : ''}`}
          title="Rechercher dans le PDF (Ctrl+F)"
          aria-label="Rechercher"
        >
          <Search className="w-4 h-4" />
        </button>
        {/* Copy */}
        <button
          type="button"
          onClick={handleCopy}
          className="w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full transition active:scale-90 relative"
          title="Copier la sélection"
          aria-label="Copier"
        >
          {copySuccess ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
        {/* Fullscreen */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full transition active:scale-90"
          title="Plein écran (F)"
          aria-label="Plein écran"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        {/* Download */}
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="w-10 h-10 inline-flex items-center justify-center hover:bg-white/10 rounded-full transition active:scale-90"
            title="Télécharger"
            aria-label="Télécharger"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* === FLOATING TOP-CENTER SEARCH BAR (overlay, glass) === */}
      {searchOpen && (
        <div className="pdf-viewer-search absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white rounded-full pl-3 pr-2 py-1.5 shadow-2xl flex items-center gap-2 ring-1 ring-white/10 min-w-[280px] max-w-[90vw]">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans cette page..."
            className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 min-w-0"
            autoFocus
          />
          {searchQuery && (
            <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
              {searchResults.count > 0 ? `${searchResults.count} résultat(s)` : 'Aucun'}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
            className="w-7 h-7 inline-flex items-center justify-center hover:bg-white/10 rounded-full transition"
            aria-label="Fermer la recherche"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Layer warning */}
      {textLayerError && !textLayerEnabled && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-3 h-3" />
          Sélection de texte désactivée (polices incompatibles). Le rendu visuel fonctionne.
        </div>
      )}

      {/* PDF Container */}
      <div
        ref={containerRef}
        className="bg-slate-200 overflow-auto pdf-viewer-container"
        // UX: container is tall enough to show the full first page in height
        // when 'width' fit is active (page fills width, container is tall).
        // A4 portrait page at fit-to-width 800px → ~1130px tall.
        // - Mobile: 70vh + 500px min (so it's tall but not overwhelming)
        // - Desktop: 95vh + 800px min (taller, more room for the page)
        // - Fullscreen: 100vh
        // paddingBottom reserves space for the floating bottom toolbar (64px + 16px gap = 80px)
        style={{
          height: isFullscreen ? '100vh' : '95vh',
          minHeight: '800px',
          // 2026-08-16: keep the 80px padding in fullscreen too — the floating
          // toolbar is now part of the fullscreen (we fullscreen the shell
          // instead of just the container), so we still need to reserve
          // space at the bottom so the last page doesn't hide under it.
          paddingBottom: 80,
        }}
        // Mobile-friendly touch + swipe + PINCH handlers.
        //  - 1 finger: swipe (existing)
        //  - 2 fingers: pinch-to-zoom (NEW 2026-08-16)
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            // Pinch start: record the initial distance between the two fingers
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchStartDistRef.current = Math.hypot(dx, dy);
            pinchStartScaleRef.current = scale;
            // Cancel any pending swipe
            touchStartRef.current = null;
            return;
          }
          const t = e.touches[0];
          touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
          touchEndRef.current = null;
        }}
        onTouchMove={(e) => {
          // PINCH: two fingers → adjust scale
          if (e.touches.length === 2 && pinchStartDistRef.current && pinchStartScaleRef.current) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const ratio = dist / pinchStartDistRef.current;
            const newScale = pinchStartScaleRef.current * ratio;
            setFitMode('manual');
            setScale(
              Math.max(MIN_SCALE, Math.min(MAX_SCALE, +(newScale * 100).toFixed(0) / 100)),
            );
            return;
          }
          if (!touchStartRef.current) return;
          const t = e.touches[0];
          touchEndRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
        }}
        onTouchEnd={() => {
          // Reset pinch state when fingers lift
          if (pinchStartDistRef.current) {
            pinchStartDistRef.current = null;
            pinchStartScaleRef.current = null;
            return;
          }
          if (!touchStartRef.current || !touchEndRef.current || !numPages) {
            touchStartRef.current = null;
            return;
          }
          const dx = touchEndRef.current.x - touchStartRef.current.x;
          const dy = touchEndRef.current.y - touchStartRef.current.y;
          const dt = touchEndRef.current.time - touchStartRef.current.time;
          // Swipe threshold: 50px horizontal, 200ms max duration, horizontal-dominant
          const isHorizontalSwipe = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5;
          const isFastEnough = dt < 500;
          if (isHorizontalSwipe && isFastEnough) {
            if (dx < 0) {
              // Swipe left → next page
              setPageNumber((p) => Math.min(numPages, p + 1));
            } else {
              // Swipe right → previous page
              setPageNumber((p) => Math.max(1, p - 1));
            }
          }
          touchStartRef.current = null;
          touchEndRef.current = null;
        }}
      >
        {error ? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center max-w-md">
              <FileWarning className="w-12 h-12 mx-auto mb-3 text-red-500" />
              <h3 className="font-bold text-lg mb-2">Impossible de charger le PDF</h3>
              <p className="text-sm text-slate-500 mb-4">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  setNumPages(null);
                  setWorkerReady(true);
                }}
                className="btn-primary text-sm inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Réessayer
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className={
              viewMode === 'continuous'
                ? 'flex flex-col items-center py-4 overflow-x-hidden'
                : 'flex justify-center items-center p-4 overflow-x-hidden'
            }
          >
            <DocumentErrorBoundary onError={setError}>
              <Document
                file={url}
                onLoadSuccess={onLoadSuccess}
                onLoadError={onLoadError}
                onLoadProgress={onLoadProgress}
                options={documentOptions}
                loading={
                  <div className="flex items-center justify-center min-h-[500px]">
                    <div className="text-center max-w-xs">
                      {/* 2026-08-18: skeleton page placeholder with shimmer
                          (Niveau 4 polish). Gray rectangle with animated
                          gradient to indicate loading state. Uses the
                          .animate-shimmer class from globals.css. */}
                      <div className="relative w-48 h-64 mx-auto mb-4 bg-slate-200 rounded-lg overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer" />
                      </div>
                      <Loader2 className="w-6 h-6 mx-auto mb-2 text-primary-500 animate-spin" />
                      {/* 2026-08-18: show "Téléchargement X%" only when
                          progress is actually > 0. If it's 0, the PDF
                          is either in browser cache (loadProgress never
                          fires) or the download is too fast to see.
                          In that case, just show a generic "Chargement…"
                          label. */}
                      <p className="text-sm font-semibold text-slate-700">
                        {`Téléchargement ${Math.round(Math.max(loadProgress, fakeProgress) * 100)}%`}
                      </p>
                      {isSlowConnection && (
                        <p className="text-xs text-amber-600 mt-1">
                          Connexion lente, ça peut prendre plus de temps…
                        </p>
                      )}
                    </div>
                  </div>
                }
                error={
                  <div className="flex items-center justify-center min-h-[500px]">
                    <div className="text-center max-w-md p-6">
                      <FileWarning className="w-10 h-10 mx-auto mb-2 text-red-500" />
                      <p className="text-sm text-slate-600 mb-3">
                        Erreur de chargement du document
                      </p>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary text-sm inline-flex items-center gap-2"
                      >
                        Ouvrir dans un nouvel onglet →
                      </a>
                    </div>
                  </div>
                }
                externalLinkTarget="_blank"
              >
                {viewMode === 'continuous' && numPages ? (
                  // CONTINUOUS MODE with TanStack Virtual — only render visible
                  // pages + overscan. Each virtual row is a single Page; the
                  // pageRefsMap is populated as the virtualizer mounts them
                  // (used by the scroll spy and the sidebar jump).
                  <div
                    style={{
                      height: virtualizer.getTotalSize(),
                      position: 'relative',
                      width: '100%',
                    }}
                  >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                      const p = virtualRow.index + 1;
                      return (
                        <div
                          key={virtualRow.key}
                          ref={(el) => {
                            pageRefsMap.current.set(p, el);
                            // 2026-08-16: store the virtual start on the element
                            // so the scroll spy can use it. offsetTop is 0 for
                            // absolute children (the offsetParent is the
                            // relative virtualizer container), so we need
                            // the actual virtual row position.
                            if (el) (el as any).__virtualStart = virtualRow.start;
                          }}
                          data-page={p}
                          className="flex justify-center"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <PageLayerBoundary onLayerError={onTextLayerError} label="text">
                            <PageLayerBoundary
                              onLayerError={onAnnotationLayerError}
                              label="annotation"
                            >
                              <Page
                                pageNumber={p}
                                scale={scale}
                                renderTextLayer={textLayerEnabled}
                                renderAnnotationLayer={annotationLayerEnabled}
                                onLoadSuccess={onPageLoadSuccess}
                                loading={
                                  <div className="flex items-center justify-center min-h-[500px] bg-white shadow-2xl rounded">
                                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                                  </div>
                                }
                                error={
                                  <div className="flex items-center justify-center min-h-[500px] bg-white shadow-2xl rounded p-8">
                                    <div className="text-center">
                                      <AlertCircle className="w-10 h-10 mx-auto mb-2 text-red-500" />
                                      <p className="text-sm text-slate-600">
                                        Erreur de rendu de la page {p}
                                      </p>
                                    </div>
                                  </div>
                                }
                                className="bg-white shadow-2xl"
                              />
                            </PageLayerBoundary>
                          </PageLayerBoundary>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // SINGLE MODE: render only the current page
                  <PageLayerBoundary onLayerError={onTextLayerError} label="text">
                    <PageLayerBoundary onLayerError={onAnnotationLayerError} label="annotation">
                      <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        renderTextLayer={textLayerEnabled}
                        renderAnnotationLayer={annotationLayerEnabled}
                        onLoadSuccess={onPageLoadSuccess}
                        loading={
                          <div className="flex items-center justify-center min-h-[500px] bg-white shadow-2xl rounded">
                            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                          </div>
                        }
                        error={
                          <div className="flex items-center justify-center min-h-[500px] bg-white shadow-2xl rounded p-8">
                            <div className="text-center">
                              <AlertCircle className="w-10 h-10 mx-auto mb-2 text-red-500" />
                              <p className="text-sm text-slate-600">Erreur de rendu de la page</p>
                            </div>
                          </div>
                        }
                        className="bg-white shadow-2xl"
                      />
                    </PageLayerBoundary>
                  </PageLayerBoundary>
                )}
                {/* 2026-08-18: PRELOAD ADJACENT PAGES (Niveau 4 polish).
                    In single mode, render pages N-1 and N+1 in a hidden
                    offscreen div. react-pdf caches the rendered pages,
                    so navigating to them later is instant. The pages
                    are visually hidden (positioned off-screen) and have
                    aria-hidden to keep them out of the accessibility tree. */}
                {viewMode === 'single' && numPages && numPages > 1 && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '-99999px',
                      width: containerWidth,
                      pointerEvents: 'none',
                    }}
                  >
                    {pageNumber > 1 && (
                      <Page
                        pageNumber={pageNumber - 1}
                        width={containerWidth}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        loading={<div className="min-h-[500px]" />}
                      />
                    )}
                    {pageNumber < numPages && (
                      <Page
                        pageNumber={pageNumber + 1}
                        width={containerWidth}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        loading={<div className="min-h-[500px]" />}
                      />
                    )}
                  </div>
                )}
              </Document>
            </DocumentErrorBoundary>
          </div>
        )}
      </div>

      {/* Bottom status bar removed — replaced by floating top-right status pill above */}
    </div>
  );
}

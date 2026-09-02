'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';

type Props = {
  url: string;
  title?: string;
  width?: number; // rendered width in px (default 240)
  height?: number; // rendered height in px (default 320)
  className?: string;
};

/**
 * Lightweight PDF thumbnail generator.
 *
 * Renders the first page of a PDF into a small <canvas>, converts to a
 * data URL, and caches the result in localStorage. Subsequent renders
 * are instant.
 *
 * - Lazy: only fetches the PDF when the element scrolls into view
 * - Cached: 7-day TTL in localStorage, key = sha1(url)[:20]
 * - Fallback: shows a generic file icon if rendering fails
 */
export default function PDFThumbnail({
  url,
  title,
  width = 240,
  height = 320,
  className = '',
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Lazy render: only generate when in viewport
  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' }, // start loading slightly before visible
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Generate thumbnail when in view
  useEffect(() => {
    if (!inView) return;
    if (!url) return;
    if (dataUrl) return; // already loaded

    let cancelled = false;

    (async () => {
      // 1) Check cache
      const cacheKey = `pdf_thumb_${await hashKey(url)}`;
      const cached = safeGetJSON<{ dataUrl: string; expires: number }>(cacheKey);
      if (cached && typeof cached.dataUrl === 'string' && cached.expires > Date.now()) {
        if (!cancelled) setDataUrl(cached.dataUrl);
        return;
      }

      // 2) Render from PDF
      setLoading(true);
      try {
        const rendered = await renderFirstPage(url, width, height);
        if (cancelled) return;
        setDataUrl(rendered);

        // 3) Save to cache (7 days). Only cache small data URLs (< 200KB)
        // to avoid localStorage quota errors.
        if (rendered.length < 200_000) {
          safeSetJSON(cacheKey, {
            dataUrl: rendered,
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
          });
        }
      } catch (e) {
        console.warn('PDF thumbnail failed:', e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inView, url, width, height, dataUrl]);

  return (
    <div
      ref={containerRef}
      className={`relative bg-slate-100 overflow-hidden flex items-center justify-center ${className}`}
      style={{ aspectRatio: `${width}/${height}` }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={title || 'PDF preview'}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : error || (!loading && !dataUrl) ? (
        <div className="flex flex-col items-center gap-1 text-slate-400">
          <FileText className="w-8 h-8" />
          {title && <span className="text-[10px] px-2 text-center line-clamp-2">{title}</span>}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 text-slate-300">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-primary-500 rounded-full animate-spin" />
          <span className="text-[10px]">Chargement...</span>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function hashKey(s: string): Promise<string> {
  // Simple hash for cache key
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

async function renderFirstPage(url: string, targetW: number, targetH: number): Promise<string> {
  // Dynamic import to avoid loading pdf.js when not needed
  const pdfjs = await import('pdfjs-dist');

  // Use the self-hosted worker
  if (typeof window !== 'undefined') {
    (pdfjs as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }

  // Load the PDF (don't load full PDF for thumbnail, just first page)
  const loadingTask = (pdfjs as any).getDocument({
    url,
    // Only need first page, so disable fetching other pages
    disableAutoFetch: true,
    disableStream: true,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  // Get viewport at the right size
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(targetW / baseViewport.width, targetH / baseViewport.height);
  const viewport = page.getViewport({ scale });

  // Render to canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  } as any).promise;

  // Convert to data URL (JPEG to save space)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

  // Cleanup
  await pdf.cleanup();
  await pdf.destroy();

  return dataUrl;
}

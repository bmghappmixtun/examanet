'use client';
/**
 * LazyPDFViewer — defer PDF.js (90 KB gz) loading until user clicks.
 *
 * The full react-pdf + pdfjs-dist bundle is ~318 KB raw / 90 KB gzipped.
 * It is the single biggest chunk on the resource page and was previously
 * preloaded even when users just wanted to read the description.
 *
 * We show a lightweight placeholder (with metadata + thumbnail if available)
 * and only mount the actual PDFViewer on click. This shaves ~90 KB from
 * the initial page load and is the most impactful single perf fix
 * identified in the 2026-07-30 page speed audit.
 *
 * Server-side: the placeholder is server-rendered (no PDF.js on the wire).
 * Client-side: the actual <PDFViewer /> is dynamically imported on click.
 *
 * 2026-09-18: supports controlled activation via `activated` prop so the
 * "Voir plein écran" button in ResourceActions can both activate the
 * viewer AND request browser fullscreen without leaving the page.
 */

import { useState, useEffect } from 'react';
import nextDynamic from 'next/dynamic';
import { Eye, FileText, Loader2, Maximize2, AlertCircle } from 'lucide-react';

const PDFViewer = nextDynamic(
  () => import('@/components/resources/PDFViewer'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin me-2" /> Chargement du lecteur PDF…
      </div>
    ),
  }
);

interface LazyPDFViewerProps {
  url: string;
  fileName: string;
  /** Approx page count for the placeholder (if known from DB) */
  pageCount?: number | null;
  /** File size in bytes, formatted */
  fileSize?: string | null;
  /**
   * 2026-09-18 (v3): parent override. When true, the PDFViewer mounts
   * immediately regardless of whether the internal placeholder button
   * was clicked. Used by the "Voir plein écran" button to activate the
   * viewer + request fullscreen without leaving the page.
   *
   * IMPORTANT: previously named `activated`, but that broke the
   * internal "Afficher le document" button because passing
   * `activated={false}` from the parent (its initial state) overrode
   * the internal state via `??`. Renamed to `forceActivated` to make
   * the OR-with-internal semantics explicit and bug-free.
   */
  forceActivated?: boolean;
  /**
   * Forwarded to PDFViewer so it can auto-request browser fullscreen
   * once the document has loaded. Paired with `forceActivated`.
   */
  autoFullscreen?: boolean;
  /**
   * Increment to re-trigger the fullscreen request. Each click of
   * "Voir plein écran" bumps this counter; the PDFViewer effect
   * depends on it so the request fires again even after the user
   * exited fullscreen with Échap.
   */
  fullscreenRequestId?: number;
}

export default function LazyPDFViewer({
  url,
  fileName,
  pageCount,
  fileSize,
  forceActivated = false,
  autoFullscreen,
  fullscreenRequestId,
}: LazyPDFViewerProps) {
  // Internal state for the placeholder button (still works when parent
  // hasn't forced activation). forceActivated ORs with this — either
  // path mounts the PDFViewer.
  const [internalActivated, setInternalActivated] = useState(false);
  const shouldLoad = forceActivated || internalActivated;
  // Defer the import slightly so it never blocks initial render. Browsers
  // will fetch the chunk in parallel with the rest of the page once the
  // user opts in. If they never click, the chunk is never downloaded.
  const handleActivate = () => setInternalActivated(true);

  if (shouldLoad) {
    return (
      <PDFViewer
        url={url}
        fileName={fileName}
        autoFullscreen={autoFullscreen}
        fullscreenRequestId={fullscreenRequestId}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* Placeholder card with metadata — renders with no JS cost */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-10 text-center border-b border-slate-200">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white border border-slate-200 shadow-sm mb-4">
          <FileText className="w-10 h-10 text-primary-600" />
        </div>
        <h3 className="font-bold text-slate-900 mb-1 text-lg break-words max-w-md mx-auto">
          {fileName.replace(/\.pdf$/i, '')}
        </h3>
        <div className="flex items-center justify-center gap-3 text-xs text-slate-500 mb-5">
          {fileSize && <span>{fileSize}</span>}
          {fileSize && pageCount ? <span>•</span> : null}
          {pageCount ? <span>{pageCount} page{pageCount > 1 ? 's' : ''}</span> : null}
        </div>

        <button
          type="button"
          onClick={handleActivate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-sm font-bold shadow-sm hover:shadow transition-all"
        >
          <Eye className="w-4 h-4" />
          Afficher le document
        </button>
        <p className="text-[11px] text-slate-400 mt-3">
          Le lecteur PDF se charge uniquement à la demande (économise ~90&nbsp;KB).
        </p>
      </div>
    </div>
  );
}

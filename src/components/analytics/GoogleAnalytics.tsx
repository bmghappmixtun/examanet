'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Google Analytics 4 tracking via gtag.js.
 * 
 * 2026-09-09 (v2): Switched from next/script to direct <script> tags in head
 * so Google's tag scanner can detect the tag on the page.
 * 
 * 2026-09-09 (v3): Moved useSearchParams to inner PageViewTracker component
 * wrapped in Suspense. The parent GoogleAnalytics function does NOT use any
 * client hooks that need to be wrapped in Suspense.
 * 
 * Activated only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set (G-XXXXXXXX).
 */

const GA_SCRIPT = (id: string) => `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}', {
  page_path: window.location.pathname,
  send_page_view: true,
});
`;

export default function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!measurementId) return null;

  return (
    <>
      {/* Inject gtag.js loader + init script via raw <script> tags so they
          appear in the initial HTML and Google's tag scanner can detect them. */}
      <script
        async
        data-cfasync="false"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      <script
        dangerouslySetInnerHTML={{ __html: GA_SCRIPT(measurementId) }}
      />
      <Suspense fallback={null}>
        <PageViewTracker measurementId={measurementId} />
      </Suspense>
    </>
  );
}

/**
 * Page view tracker — wrapped in Suspense because it uses useSearchParams.
 * Updates the page_path on every route change.
 */
function PageViewTracker({ measurementId }: { measurementId: string }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window.gtag !== 'function') return;
    const url = window.location.pathname + window.location.search;
    window.gtag('config', measurementId, {
      page_path: url,
    });
  }, [searchParams, measurementId]);

  return null;
}

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

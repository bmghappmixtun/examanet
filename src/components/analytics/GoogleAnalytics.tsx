'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

/**
 * Google Analytics 4 tracking via gtag.js.
 * 
 * 2026-09-09 (v2): Switched from next/script to direct <script> tags in head
 * so Google's tag scanner can detect the tag on the page. With next/script
 * strategy="afterInteractive", the tag is only injected via JS at runtime,
 * which makes it invisible to Google's verification wizard.
 * 
 * Activated only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set (G-XXXXXXXX).
 * Tracks page views on route change.
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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!measurementId || typeof window.gtag !== 'function') return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    window.gtag('config', measurementId, {
      page_path: url,
    });
  }, [pathname, searchParams, measurementId]);

  if (!measurementId) return null;

  return (
    <>
      {/* Inject gtag.js loader + init script via dangerouslySetInnerHTML so it
          appears in the initial HTML and Google's tag scanner can detect it. */}
      <script
        async
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
 * Page view tracker — must be wrapped in Suspense because it uses useSearchParams.
 * Updates the page_path on every route change.
 */
function PageViewTracker({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window.gtag !== 'function') return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    window.gtag('config', measurementId, {
      page_path: url,
    });
  }, [pathname, searchParams, measurementId]);

  return null;
}

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

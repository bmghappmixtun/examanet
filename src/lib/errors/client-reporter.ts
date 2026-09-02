/**
 * Client-side error reporter with user-action breadcrumbs
 * Tracks: clicks, navigations, form submissions → reports to /api/errors/log
 */

interface Breadcrumb {
  type: 'click' | 'navigation' | 'submit' | 'input' | 'key' | 'error';
  timestamp: number;
  data: Record<string, unknown>;
}

const MAX_BREADCRUMBS = 20;
let breadcrumbs: Breadcrumb[] = [];

/**
 * Known/handled errors that should NOT be reported to the error log.
 * These are errors the application already handles gracefully (e.g. the
 * PDF viewer shows a fallback UI), so reporting them just creates noise
 * in the nightly digest.
 *
 * Each entry is a substring matched against the error message
 * (case-insensitive). Keep the list short and add only well-understood,
 * user-visible handled errors.
 */
const SUPPRESSED_ERROR_PATTERNS: readonly string[] = [
  // PDF.js: corrupt/invalid PDF — already handled by DocumentErrorBoundary
  // (shows "Impossible de charger le PDF" to the user)
  'Error in input stream',
  // PDF.js: similar malformed-PDF errors
  'InvalidPDFException',
  'MissingPDFException',
  'UnexpectedResponseException',
  'PasswordException',
  // ChunkLoadError: stale _next/static/chunks/* reference after a Vercel
  // deploy swaps the chunk hash. Handled by `app/error.tsx` which auto-
  // reloads the page once (see comment there). Reporting these just
  // floods the nightly digest — every Vercel deploy triggers ~100-200
  // ChunkLoadError reports (one per user with a stale tab). Fixed
  // 2026-08-14 (ERR-9X4BRN 87x, ERR-CXCQ9G 34x, ERR-R5CJJ3 10x,
  // ERR-T9Y8SG 5x, ERR-RAJEVR 4x, ERR-CXY7HC 1x, ERR-U26YDE 1x —
  // 142 reports/24h from deploy artifacts).
  'chunkloaderror',
  'loading chunk',
];

function isSuppressedError(message: string | undefined | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return SUPPRESSED_ERROR_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
}

interface ClientErrorReport {
  message: string;
  stack?: string;
  url?: string;
  component?: string;
  action?: string;
  data?: Record<string, unknown>;
  severity?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  breadcrumbs?: Breadcrumb[];
}

let reportQueue: ClientErrorReport[] = [];
let isReporting = false;

async function flushQueue() {
  if (isReporting || reportQueue.length === 0) return;
  isReporting = true;

  while (reportQueue.length > 0) {
    const report = reportQueue.shift()!;
    try {
      await fetch('/api/errors/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'CLIENT', ...report }),
        keepalive: true,
      });
    } catch {
      reportQueue.push(report);
      break;
    }
  }

  isReporting = false;
}

/**
 * Add a breadcrumb to the rolling buffer
 * Keeps last MAX_BREADCRUMBS events
 */
export function trackBreadcrumb(type: Breadcrumb['type'], data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  breadcrumbs.push({ type, timestamp: Date.now(), data });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS);
  }
}

/**
 * Get current breadcrumbs (called by error handlers)
 */
export function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

/**
 * Clear breadcrumbs (e.g., on successful navigation to a new page)
 */
export function clearBreadcrumbs(): void {
  breadcrumbs = [];
}

/**
 * Build a CSS-selector-like path for an element
 * Used for click events so we can identify which element the user clicked
 */
function getElementSelector(el: Element | null): string {
  if (!el) return 'unknown';
  if (el.id) return `#${el.id}`;

  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 5) {
    let part = cur.tagName.toLowerCase();
    if (cur.className && typeof cur.className === 'string') {
      const cls = cur.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) part += `.${cls}`;
    }
    if (cur.getAttribute('data-testid')) {
      part = `[data-testid="${cur.getAttribute('data-testid')}"]`;
    }
    parts.unshift(part);
    if (cur.id) {
      parts.unshift(`#${cur.id}`);
      break;
    }
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(' > ');
}

/**
 * Get human-readable text for an element (truncated)
 */
function getElementText(el: Element | null): string {
  if (!el) return '';
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return text;
}

/**
 * Report a client-side error to the server
 * Automatically attaches breadcrumbs so you can see what the user did before
 */
export function reportClientError(report: ClientErrorReport): void {
  if (typeof window === 'undefined') return;

  // Drop known/handled errors — they would just create noise in the
  // nightly digest (Discord alerts, agent notifications).
  if (isSuppressedError(report.message)) {
    return;
  }

  reportQueue.push({
    severity: 'ERROR',
    breadcrumbs: getBreadcrumbs(),
    ...report,
    url: report.url || window.location.href,
  });

  setTimeout(flushQueue, 0);
}

/**
 * Install global error handlers AND breadcrumb trackers
 * Catches: window.onerror, unhandledrejection, click/submit/input events
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;
  if ((window as unknown as { __examanetHandlersInstalled?: boolean }).__examanetHandlersInstalled) return;
  (window as unknown as { __examanetHandlersInstalled?: boolean }).__examanetHandlersInstalled = true;

  // ===== BREADCRUMBS =====

  // 1. Click events — capture which element the user clicked
  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    trackBreadcrumb('click', {
      selector: getElementSelector(target),
      text: getElementText(target),
      tag: target?.tagName?.toLowerCase(),
      href: (target as HTMLAnchorElement)?.href || null,
    });
  }, { capture: true, passive: true });

  // 2. Navigation — track URL changes (SPA-aware)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      const from = lastUrl;
      lastUrl = window.location.href;
      trackBreadcrumb('navigation', { from, to: window.location.href });
    }
  });
  observer.observe(document, { subtree: true, childList: true });

  // Also catch popstate and pushState
  window.addEventListener('popstate', () => {
    trackBreadcrumb('navigation', { type: 'popstate', to: window.location.href });
  });
  const origPush = history.pushState;
  history.pushState = function (...args) {
    const result = origPush.apply(this, args);
    trackBreadcrumb('navigation', { type: 'pushState', to: window.location.href });
    return result;
  };
  const origReplace = history.replaceState;
  history.replaceState = function (...args) {
    const result = origReplace.apply(this, args);
    trackBreadcrumb('navigation', { type: 'replaceState', to: window.location.href });
    return result;
  };

  // 3. Form submissions
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    trackBreadcrumb('submit', {
      selector: getElementSelector(form),
      action: form.action,
      method: form.method,
    });
  }, { capture: true });

  // 4. Keyboard shortcuts (Enter on forms, Esc on modals, etc.)
  document.addEventListener('keydown', (e) => {
    // Only track meaningful keys
    if (['Enter', 'Escape', 'Tab'].includes(e.key)) {
      const target = e.target as Element | null;
      trackBreadcrumb('key', {
        key: e.key,
        selector: getElementSelector(target),
      });
    }
  }, { capture: true, passive: true });

  // ===== ERROR HANDLERS =====

  window.addEventListener('error', (event) => {
    reportClientError({
      message: event.message,
      stack: event.error?.stack,
      component: 'window.onerror',
      action: 'unhandled',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason;
    reportClientError({
      message: err?.message || String(err),
      stack: err?.stack,
      component: 'unhandledrejection',
      action: 'promise',
    });
  });
}

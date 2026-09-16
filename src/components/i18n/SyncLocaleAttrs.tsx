/**
 * LocaleSyncScript — renders a SYNCHRONOUS inline script at the top of <body>
 * that updates <html lang>, <html dir>, and <body className> BEFORE React
 * hydrates.
 *
 * This replaces the previous SyncLocaleAttrs component (2026-09-16) which used
 * useEffect to update these attributes. The problem with useEffect is that it
 * runs AFTER hydration completes. When the user visits /ar/*:
 * - SSR renders <body className="font-sans">  (no 'rtl' class)
 * - React hydrates and expects <body className="font-sans">
 * - useEffect fires and adds 'rtl' to body className
 * But the timing between React's internal state and DOM is mismatched, and
 * the React hydration walker also re-checks <html dir> and lang attributes
 * (which had `suppressHydrationWarning`), so the body class change cascades
 * into React #418/#423/#425 errors on every [locale]/* page.
 *
 * CRITICAL: We can't change the SSR HTML per request without breaking ISR
 * (cf PERF 2026-08-16 comment in app/layout.tsx). So the fix is:
 * - The inline script runs synchronously when HTML is parsed (before any
 *   external scripts load).
 * - It reads window.location.pathname, infers locale, and updates
 *   <html lang/dir> + body className.
 * - This runs FIRST, then React hydrates against the post-script DOM, and
 *   SyncLocaleAttrs (now a no-op return null) doesn't cause anything.
 */

const SCRIPT = `(function(){try{
var p=window.location.pathname;
var m=p.match(/^\\/(ar|fr)(\\/|$)/);
var loc=m&&m[1];
if(loc==='ar'){
  document.documentElement.lang='ar';
  document.documentElement.dir='rtl';
  document.body.classList.add('rtl');
} else if(loc==='fr'){
  document.documentElement.lang='fr';
  document.documentElement.dir='ltr';
  document.body.classList.remove('rtl');
}
}catch(e){}})();`;

export default function SyncLocaleAttrs() {
  // dangerouslySetInnerHTML script is rendered inline, parsed and executed
  // synchronously by the browser BEFORE any external scripts or React
  // hydration. Since the script runs before React mounts, by the time React
  // tries to hydrate, the DOM already has the correct attrs/className
  // matching what the [locale]/* layout would have rendered server-side
  // (if it could read the locale).
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: SCRIPT }}
    />
  );
}

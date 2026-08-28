/**
 * Per-route loading state for /professeurs/[numericId]/[slug]
 *
 * WHY THIS FILE EXISTS (fixes React #418/#419/#422 hydration mismatch):
 *
 * The root loading.tsx renders a minimal spinner centered on the screen.
 * When the teacher profile page is rendered, Next.js streams the page
 * (because of `await params` + several async DB queries), and the initial
 * HTML response shows the root loading.tsx as the Suspense fallback.
 *
 * Once the page is ready, the streamed content is moved into the Suspense
 * boundary. But the root loading.tsx structure (a single centered spinner
 * inside a min-h-screen div) does NOT match the page's structure (a
 * `<div className="min-h-screen flex flex-col">` wrapping Header + main +
 * Footer), so React's hydration check fails with #418/#419/#422.
 *
 * By providing a per-route loading.tsx that mirrors the page's outer
 * structure (Header + main skeleton + Footer inside the same flex-col
 * wrapper), the structure stays consistent between fallback and streamed
 * content, and React can hydrate cleanly.
 *
 * History of fixes:
 *   - 2026-07-20 (commit 17d9586): added per-route not-found.tsx for the
 *     notFound() streaming case.
 *   - 2026-07-25 (commit 695b225): aligned loading.tsx structure with page.
 *   - 2026-07-26 (this commit): added JSON-LD script placeholders (Person
 *     + BreadcrumbList) and changed breadcrumb wrapper from <div> to <nav>
 *     to match the page's actual element types when the page resolves to
 *     a real teacher profile.
 *   - 2026-08-05 (this commit): the page now ALWAYS renders the FR <h1> +
 *     AR <h2> name pair (hidden via CSS when not applicable) and the
 *     resources-list + empty-state as siblings (hidden via CSS based on
 *     resources.length). The sidebar also always renders 5 cards
 *     (Contact + Répartition + Systèmes + Sujets + Types), hidden via
 *     CSS. Mirroring that here to prevent React #418/#422 hydration
 *     mismatches (ERR-FCUG5X 3x #422, 2026-08-05 nightly digest).
 */
export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Placeholders for the page's Person + BreadcrumbList JSON-LD scripts
          (rendered as the first two children of the wrapper). React's
          hydration check sees the same <script type="application/ld+json">
          element types and keys on both sides, regardless of innerHTML. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: '{}' }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: '{}' }}
      />

      <div className="flex-1 pt-20">
        {/* Breadcrumb skeleton — <nav> (NOT <div>) to match the page's actual
            element type. The page renders <nav aria-label="Fil d'Ariane">,
            so the loading must too.
            Element types MUST match the page: <a> for next/link (Accueil +
            Professeurs) and <span> for the separator + the active teacher
            name. The previous version used <div> for the two links, which
            mismatched the page's <a> element type and could trigger
            React #418/#422. (ERR-ZWWM8B 1x #419, ERR-F8NFRY 1x #419 in
            2026-08-05 nightly digest, /professeurs/[id]/[slug].) */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <nav
            aria-label="Fil d'Ariane"
            className="flex items-center gap-1 text-xs text-slate-500 flex-wrap"
          >
            <a
              href="/"
              aria-hidden="true"
              tabIndex={-1}
              className="h-3 w-12 bg-slate-200 rounded animate-pulse block"
            />
            <span className="text-slate-300">›</span>
            <a
              href="/professeurs"
              aria-hidden="true"
              tabIndex={-1}
              className="h-3 w-16 bg-slate-200 rounded animate-pulse block"
            />
            <span className="text-slate-300">›</span>
            <span className="h-3 w-24 bg-slate-200 rounded animate-pulse block" />
          </nav>
        </div>

        {/* Hero header skeleton — MUST mirror the page's structure exactly.
            The page renders the hero wrapper with TWO children: the radial-gradient
            overlay div + the inner relative content div. A child-count mismatch
            (1 vs 2) here triggered React #418/#422 hydration errors on
            /professeurs/[numericId]/[slug] (ERR-XXHYG9, ERR-RNYTCQ, 2026-08-03
            nightly digest, 12 errors total). */}
        <div className="relative bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 overflow-hidden">
          {/* Radial-gradient overlay (mirrors page.tsx line 424) */}
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_50%,rgba(245,158,11,0.15),transparent_50%)]" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Avatar skeleton */}
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl bg-slate-200 animate-pulse flex-shrink-0" />

              <div className="flex-1 min-w-0 w-full space-y-3">
                {/* Name skeleton — TWO placeholders matching the page's
                 * always-rendered <h1> + <h2> pair. The page conditionally
                 * shows one or both based on hasFr/hasAr (FR/AR name).
                 * Element types MUST be <h1> and <h2> to match the page
                 * — a <div> would trigger an element-type mismatch in
                 * React's hydration check.
                 * 2026-08-05 fix (ERR-FCUG5X 3x #422). */}
                <h1
                  aria-hidden="true"
                  className="h-8 w-64 bg-slate-200 rounded animate-pulse text-[0px] leading-none"
                />
                <h2
                  aria-hidden="true"
                  className="h-6 w-56 bg-slate-200 rounded animate-pulse text-[0px] leading-none"
                />
                {/* Meta skeleton */}
                <div className="flex flex-wrap gap-2 mt-2">
                  <div className="h-6 w-20 bg-slate-200 rounded-full animate-pulse" />
                  <div className="h-6 w-16 bg-slate-200 rounded-full animate-pulse" />
                  <div className="h-6 w-24 bg-slate-200 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar skeleton */}
        <div className="bg-white border-y border-slate-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 animate-pulse flex-shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-5 w-12 bg-slate-200 rounded animate-pulse" />
                    <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content skeleton */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main column: resources skeleton.
             * 2026-08-05 fix: the page now ALWAYS renders the resources-list
             * AND the empty-state as siblings (hidden via CSS), so the
             * lg:col-span-2 <div> has 2 children in both states. The header
             * div has 2 children (h2 + always-rendered "Tout voir" link,
             * hidden when ≤ 6). Mirroring that here exactly. */}
            <div className="lg:col-span-2">
              {/* Header: h2 + "Tout voir" link (always-rendered, hidden when ≤ 6) */}
              <div className="flex items-center justify-between mb-6">
                <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
                <div className="h-5 w-20 bg-slate-200 rounded animate-pulse" />
              </div>
              {/* Resources list skeleton (hidden when 0) */}
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="block bg-white rounded-2xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-14 rounded-lg bg-slate-200 animate-pulse flex-shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-4 w-3/4 bg-slate-200 rounded animate-pulse" />
                        <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                        <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Empty-state placeholder (hidden when > 0). Mirrors the page's
               * always-rendered empty-state div so the lg:col-span-2 wrapper
               * has 2 children in both states. */}
              <div
                className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 hidden"
                aria-hidden="true"
              >
                <div className="w-12 h-12 mx-auto mb-3 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-72 mx-auto bg-slate-200 rounded animate-pulse" />
                <div className="h-3 w-56 mx-auto mt-2 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>

            {/* Sidebar skeleton — 5 cards to match the page's
             * always-rendered Contact + Répartition + Systèmes + Sujets +
             * Types cards (each hidden via CSS in the page when the
             * corresponding data is empty). Mirroring that here to keep
             * the sidebar's child count stable (5 vs 5).
             * Each card title uses <h3> (NOT <div>) to match the page's
             * <h3 className="font-bold mb-3 flex items-center gap-2 ...">
             * element type. A <div> title would trigger an element-type
             * mismatch in React's hydration check.
             * 2026-08-05 fix (ERR-FCUG5X 3x #422).
             * 2026-08-06 fix: changed card title <div> → <h3> (ERR-ZWWM8B
             * 1x #419, ERR-F8NFRY 1x #419 in 2026-08-05 nightly digest). */}
            <aside className="space-y-6">
              {/* 1. Contact card (always rendered) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <h3
                  aria-hidden="true"
                  className="h-5 w-24 bg-slate-200 rounded animate-pulse text-[0px] leading-none"
                />
                <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-slate-100 rounded animate-pulse" />
                <div className="h-9 w-full bg-slate-200 rounded-xl animate-pulse" />
              </div>
              {/* 2. Répartition par matière (hidden when bySubject empty) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <h3
                  aria-hidden="true"
                  className="h-5 w-32 bg-slate-200 rounded animate-pulse text-[0px] leading-none"
                />
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-1">
                    <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                    <div className="h-2 bg-slate-100 rounded-full animate-pulse" />
                  </div>
                ))}
              </div>
              {/* 3. Systèmes techniques (hidden when bySystem empty) */}
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-200 p-5 space-y-3">
                <h3
                  aria-hidden="true"
                  className="h-5 w-40 bg-orange-200 rounded animate-pulse text-[0px] leading-none"
                />
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-3 w-full bg-orange-100 rounded animate-pulse" />
                ))}
              </div>
              {/* 4. Sujets populaires (hidden when topics empty) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <h3
                  aria-hidden="true"
                  className="h-5 w-32 bg-slate-200 rounded animate-pulse text-[0px] leading-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-5 w-16 bg-slate-100 rounded-full animate-pulse" />
                  ))}
                </div>
              </div>
              {/* 5. Types de contenu (hidden when byType empty) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <h3
                  aria-hidden="true"
                  className="h-5 w-32 bg-slate-200 rounded animate-pulse text-[0px] leading-none"
                />
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-3 w-full bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>

      </div>
  );
}

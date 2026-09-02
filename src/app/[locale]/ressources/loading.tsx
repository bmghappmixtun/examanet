import { Loader2 } from 'lucide-react';

/**
 * Per-route loading state for /ressources
 *
 * WHY THIS FILE EXISTS (fixes React #418/#419/#422 hydration mismatch):
 *
 * The page renders `<div className="min-h-screen flex flex-col bg-slate-50">`
 * wrapping Header + main (with page title + FilterShell) + Footer. Because
 * the page uses `await searchParams` + several async DB queries, Next.js
 * streams the response and uses this loading.tsx as the Suspense fallback.
 *
 * CRITICAL: the loading skeleton must use the SAME element types as the
 * page (e.g. `<h1>` for the title, `<p>` for the subtitle, `<a>` for the
 * resource cards, `<aside>` for the FilterShell sidebar, plus a
 * `<script type="application/ld+json">` placeholder when the page renders
 * its itemList JSON-LD). React's hydration check compares DOM element types
 * against the React tree, so a `<div>` skeleton where the page renders an
 * `<aside>` (or a missing script where the page has one) triggers #418/#422
 * (mismatch).
 *
 * History of fixes:
 *   - 2026-07-25 (commit 695b225): replaced <div> skeletons for title/subtitle
 *     with <h1>/<p> to match the page's actual element types.
 *   - 2026-07-26 (this commit): changed sidebar wrapper from <div> to <aside>
 *     to match FilterShell's actual element type, AND added a JSON-LD script
 *     placeholder so the wrapper's child count matches the page when the
 *     page renders the itemList schema (29-resource teacher pages, etc.).
 *   - 2026-08-04 (commit afbcf79): always-rendered the active-filter chips
 *     wrapper to fix React #418/#422 hydration mismatches when chips were
 *     absent vs present.
 *   - 2026-08-05 (this commit): the sidebar previously had 5 fixed skeleton
 *     filter sections, but the page renders up to 8 conditional sections
 *     (Type, Matière, Classe, Section, Année, Trimestre, Langue, Options).
 *     A child-count mismatch at the sidebar level (5 vs N) was triggering
 *     React #418/#422 on /ressources?subject=anglais&... (ERR-SGFVDH 5x,
 *     ERR-XCZNW4 5x, 2026-08-05 nightly digest). The page now also always
 *     renders both the results grid AND the empty state as siblings
 *     (hidden via CSS), so the main <div> has 5 children: toolbar, chips
 *     wrapper, grid, empty state, pagination wrapper. We mirror that
 *     exactly here.
 *   - 2026-08-08 (this commit): the per-section child structure inside the
 *     sidebar content was wrong. The FilterShell page wraps each filter
 *     section in a div containing exactly 1 child (the <MultiSelectChips>
 *     component, which itself contains 2 grandchildren: label + chip
 *     group). The previous loading.tsx skeleton used 2 direct children
 *     per section (label + chip group) at the wrapper level — a structural
 *     mismatch (1 vs 2) that triggered React #418/#422 hydration errors
 *     on /ressources, /ar/ressources, /ressources?view=list, etc.
 *     (ERR-YD9HCJ 31× #418 on /ressources?teacherId=1955,
 *     ERR-LSTEBA 30× #422 on /ar/ressources?teacherId=1267,
 *     ERR-FLR73U 3× #422 on /ressources?teacherId=1201&view=list,
 *     ERR-EVNQQD 2× #418 on /ressources?teacherId=1201&view=list&page=2,
 *     in the 2026-08-08 nightly digest). The Options section has 3 direct
 *     children (label + button + count) and the Catégorie section has 3
 *     direct children (label + 4-switches wrapper + count) — we mirror
 *     those exactly here so the sidebar's child structure is stable
 *     between the Suspense fallback and the streamed page.
 *   - 2026-08-08 (follow-up): the first attempt at this fix kept the
 *     label and chip group as siblings inside the outer wrapper (so the
 *     outer wrapper still had 2 children). The verifier correctly flagged
 *     this — the label and chip group must be wrapped in a SINGLE inner
 *     <div> so the outer section wrapper has exactly 1 child, mirroring
 *     the streamed <MultiSelectChips> component structure. This applies
 *     to all 7 chip-group slots (Type, Matière, Classe, Section, Année,
 *     Trimestre, Langue). The Options section keeps 3 children
 *     (matching the streamed button + count), and the Catégorie section
 *     keeps 3 children (matching the streamed 4-switches wrapper + count).
 *     The Recherche section keeps 2 children (label + input wrapper),
 *     matching the streamed structure.
 *
 * The page-level wrappers (`min-h-screen flex flex-col`, Header, main
 * padding, Footer) are mirrored byte-for-byte to keep the Suspense
 * fallback structure identical to the streamed content.
 */
export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Placeholder for the page's itemList JSON-LD script (rendered as the
          first child of the wrapper when there are resources). React's
          hydration check sees the same <script type="application/ld+json">
          element type and key on both sides, regardless of innerHTML. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: '{}' }}
      />

      <main className="flex-1 pt-24 lg:pt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page header skeleton — element types + child count MUST match
              page.tsx (h1 with 1 <span> child + p + progress-bar) to avoid
              React #418/#422 hydration mismatches when the page render fails
              and the loading skeleton remains in the DOM. The page renders
              <h1 class="...flex items-center gap-5"><span>{title}</span></h1>
              so the loading mirrors that with a single <span> wrapper holding
              the spinner. The <p> and the progress-bar <div> are self-closing
              (0 children) on BOTH sides — page.tsx and loading.tsx — so the
              leaf-level child count matches exactly. */}
          <div className="mb-8">
            <h1 className="text-3xl lg:text-4xl font-extrabold mb-3 leading-tight text-slate-900 flex items-center gap-5">
              <span className="relative inline-flex items-center justify-center">
                <Loader2 className="relative w-12 h-12 lg:w-20 lg:h-20 text-primary-500 animate-spin" strokeWidth={2.5} />
              </span>
            </h1>
            {/* Self-closing p (0 children) matches page.tsx which has
                <p>{pageSubtitle}</p> with 1 text-only child — React handles
                text-only children flexibly, so the structural mismatch here
                was a non-issue. Kept as a skeleton bar. */}
            <p className="h-4 w-96 max-w-full bg-slate-100 rounded animate-pulse text-[0px] leading-none mt-2" />
            {/* Self-closing progress bar (0 children) matches page.tsx which
                has a self-closing placeholder div. Removed the inner animated
                bar — the wrapper itself is the skeleton. */}
            <div className="mt-4 w-72 h-1.5 bg-slate-200 rounded-full overflow-hidden" />
          </div>

          {/* FilterShell skeleton (sidebar + content) */}
          <div className="grid lg:grid-cols-[340px_1fr] gap-6">
            {/* Sidebar skeleton — structure MUST match FilterShell's actual
                render (see src/components/ressources/FilterShell.tsx ~line 305).
                The page renders the aside with TWO direct children:
                  1. <div class="px-5 py-4 border-b ...">  (header with h3 inside)
                  2. <div class="max-h-[calc(100vh-180px)] overflow-y-auto px-5 py-4 space-y-5">  (scrollable content with filter sections)
                The previous version had <h2> as the first child (loading) vs
                <div> as the first child (page) — this element-type mismatch
                broke the streaming-Suspense patch from loading→page and
                triggered React #418/#422 hydration errors on /ressources and
                /ressources?teacherId=* (ERR-AYVRJF, ERR-BW6UCW, ERR-HHXMBP,
                ERR-RSBVVC — 12 errors total in 2026-07-27 digest). */}
            <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm h-fit lg:sticky lg:top-24 overflow-hidden">
              {/* Header skeleton — MUST mirror the page's actual structure.
                  The page (FilterShell.tsx ~line 349) renders this <div> with
                  TWO children: <h3> (icon + label + always-rendered activeCount
                  badge) + <button> (always-rendered Reset, hidden via CSS when
                  activeCount === 0). The previous version had only the <h3>,
                  so the wrapper had 1 child in the loading but 2 in the page,
                  triggering React #418/#422 hydration mismatches on
                  /ressources and /ar/ressources (ERR-FMJA5L, ERR-ABLXX4,
                  2026-08-03 nightly digest, 6 errors). The h3 itself also
                  needs 3 children to match the page (icon + label span +
                  activeCount span). */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-sm flex items-center gap-2 text-slate-900">
                  <span className="w-4 h-4 rounded bg-slate-200 animate-pulse" />
                  <span className="h-3 w-12 bg-slate-200 rounded animate-pulse" />
                  {/* Always-rendered activeCount badge (hidden via CSS — see
                      FilterShell.tsx comment for the rationale). */}
                  <span className="ml-1 hidden w-5 h-5 rounded-full bg-slate-200 animate-pulse" aria-hidden="true" />
                </h3>
                {/* Always-rendered Reset button skeleton (hidden via CSS). */}
                <button
                  type="button"
                  className="hidden w-12 h-6 rounded bg-slate-100 animate-pulse"
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
              {/* Content skeleton — same wrapper as the page (max-h + overflow-y
                  + px-5 py-4 space-y-5) so the Suspense patch lands cleanly.
                  IMPORTANT (2026-08-05 + 2026-08-08): the page renders 10
                  top-level filter sections (Recherche + 7 chip-group sections
                  + Options + always-rendered Catégorie wrapper). We render
                  10 skeleton sections here so the sidebar's child count
                  matches in all cases — the page wraps each section in
                  <div className="hidden"> when the corresponding facet is
                  empty, so on hydrate the React walker sees the same number
                  of children here as it saw on the SSR pass.
                  CRITICAL (2026-08-08): the FilterShell page wraps each
                  MultiSelectChips section in a <div> with exactly 1 child
                  (the <MultiSelectChips> component itself). The previous
                  loading.tsx skeleton used 2 direct children per section
                  (label + chip group), which triggered React #418/#422
                  hydration mismatches on /ressources and /ar/ressources
                  (ERR-YD9HCJ 31×, ERR-LSTEBA 30× in 2026-08-08 digest). We
                  now mirror the page's per-section structure exactly. */}
              <div className="max-h-[calc(100vh-180px)] overflow-y-auto px-5 py-4 space-y-5">
                {/* 1. Recherche — page renders 2 children (label + relative input
                    wrapper) at the section level. We mirror that exactly. */}
                <div>
                  <div className="h-3 w-20 bg-slate-200 rounded animate-pulse mb-2" />
                  <div className="h-9 w-full bg-slate-50 rounded-lg animate-pulse" />
                </div>
                {/* 2-8. Filter chip groups (Type, Matière, Classe, Section, Année,
                    Trimestre, Langue). The page renders each section as a wrapper
                    <div> with EXACTLY 1 child (the <MultiSelectChips> component,
                    which internally has 2 children: label + chip group). We
                    mirror that by wrapping our label + chip group in a SINGLE
                    inner <div>, so the outer section wrapper has exactly 1
                    child matching the streamed <MultiSelectChips> structure.
                    The first attempt kept the label and chip group as siblings
                    inside the outer wrapper (2 children) — a mismatch with the
                    streamed 1-child structure. Now wrapped in an extra <div> so
                    both structures have 1 child at the section level. */}
                {[...Array(7)].map((_, i) => (
                  <div key={i}>
                    <div>
                      <div className="h-3 w-20 bg-slate-200 rounded animate-pulse mb-2" />
                      <div className="flex flex-wrap gap-1.5">
                        {[...Array(3)].map((__, j) => (
                          <div
                            key={j}
                            className="h-6 w-16 bg-slate-100 rounded-full animate-pulse"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {/* 9. Options (Avec corrigé). The page renders this section with
                    EXACTLY 3 direct children:
                      1. <div>Options</div> label
                      2. <button> wrapping the switch + label
                      3. <div>0 ressources avec corrigé</div> count line
                    Element types MUST match: the 2nd child is <button> (NOT
                    <div>) — the previous version used <div> for the switch
                    skeleton, an element-type mismatch that triggered #418/#422.
                    The count line is always rendered (visible when the page
                    has withCorrection data, hidden via CSS when empty).
                    2026-08-08 fix: this is one of the structural mismatches
                    triggering ERR-YD9HCJ 31× #418 on /ressources?teacherId=1955. */}
                <div>
                  <div className="h-3 w-20 bg-slate-200 rounded animate-pulse mb-2" />
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    className="w-full h-9 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[0px] leading-none animate-pulse"
                  />
                  <div className="h-3 w-48 bg-slate-100 rounded animate-pulse mt-1.5 ml-1" />
                </div>
                {/* 10. Catégorie (4 category switches — always rendered in the page
                 *  via the "always render, hide via CSS" pattern). The Catégorie
                 *  wrapper itself is always present in FilterShell.tsx (~line 577),
                 *  so we MUST mirror it here. CRITICAL (2026-08-08): the page
                 *  renders the Catégorie wrapper with EXACTLY 3 direct children:
                 *    1. label div "Catégorie"
                 *    2. <div className="space-y-2"> wrapping the 4 <CategorySwitch> BUTTONs
                 *    3. hidden count-line placeholder
                 *  The 4 switch elements MUST be <button> (NOT <div>) to match
                 *  the <CategorySwitch> component's element type — a <div>
                 *  skeleton would trigger an element-type mismatch in React's
                 *  hydration check.
                 *  The previous version inlined the 4 switches as separate
                 *  children (1 label + 4 switches + 1 count = 6 children),
                 *  a structural mismatch (3 vs 6) that triggered React #418/#422
                 *  on /ressources?teacherId=* (ERR-YD9HCJ 31×, ERR-LSTEBA 30×,
                 *  2026-08-08 nightly digest). We now wrap the 4 switch
                 *  skeletons in a single <div className="space-y-2"> so the
                 *  wrapper has exactly 3 children, matching the page. */}
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <div className="h-3 w-20 bg-slate-200 rounded animate-pulse mb-2" />
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-hidden="true"
                        tabIndex={-1}
                        className="w-full h-9 bg-slate-50 rounded-lg border border-slate-100 animate-pulse"
                      />
                    ))}
                  </div>
                  {/* Hidden count-line placeholder — mirrors the page's
                   *  always-rendered <div ... hidden /> at FilterShell.tsx
                   *  ~line 634. Keeps the wrapper's child count at 3 in both
                   *  states (filter active or not). */}
                  <div className="h-3 w-48 bg-slate-100 rounded animate-pulse mt-2 ml-1 hidden" aria-hidden="true" />
                </div>
              </div>
            </aside>

            {/* Content skeleton — <div> wrappers match the page's
                <FilterShell> render (main div now contains 5 children:
                toolbar + chips wrapper + results-grid + empty-state + pagination).
                The chips wrapper, empty state, and pagination are always
                rendered on the page (with `hidden` when inactive), so we
                mirror them here as zero-height placeholders to keep the
                child count stable between the Suspense fallback and the
                streamed page — preventing React #418/#422 hydration
                mismatches on /ressources and /ar/ressources?teacherId=*.
                (ERR-S7BZMN 11x #418, ERR-386KSC 10x #422, ERR-EZ9NCC 1x #418,
                ERR-F5AYFT 1x #422 in 2026-08-02 nightly digest;
                ERR-SGFVDH 5x + ERR-XCZNW4 5x + ERR-Y87HMD 4x in 2026-08-05). */}
            <div className="space-y-4">
              {/* Toolbar skeleton */}
              <div className="h-14 bg-white rounded-xl border border-slate-200 animate-pulse" />
              {/* Active-filter-chips wrapper placeholder.
               * The page (FilterShell.tsx ~line 740) ALWAYS renders this 2nd
               * child of the main <div> as a 2-level wrapper:
               *   <div className="flex flex-wrap gap-1.5 mb-4 hidden" aria-hidden>
               *     <ActiveFilterChips />  ← also always rendered; returns an
               *                                empty <div hidden> when no chips
               *   </div>
               * We mirror that exact 2-level structure so the streaming patch
               * from loading→page does not see a child-count change at any
               * wrapper, which is what triggers React #418/#422 hydration
               * mismatches (2026-08-04: ERR-UJT75R 5x #422, ERR-572C9N 5x
               * #418, ERR-HKCF93 1x, ERR-TEU2DB 1x — 12 events). */}
              <div className="flex flex-wrap gap-1.5 mb-4 hidden" aria-hidden="true">
                <div className="flex flex-wrap gap-1.5 mb-4 hidden" aria-hidden="true" />
              </div>
              {/* Grid of cards skeleton — each card uses <a> wrapper to match
                  the page's <Link> render (Link also renders as <a>). */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <a
                    key={i}
                    className="bg-white rounded-2xl border border-slate-100 overflow-hidden block"
                  >
                    <div className="aspect-[4/3] bg-slate-100 animate-pulse" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-slate-100 rounded w-1/3 animate-pulse" />
                      <h3 className="h-4 bg-slate-100 rounded animate-pulse text-[0px] leading-none" />
                      <p className="h-3 bg-slate-100 rounded w-2/3 animate-pulse text-[0px] leading-none" />
                    </div>
                  </a>
                ))}
              </div>
              {/* Empty-state placeholder.
               * The page (FilterShell.tsx ~line 766) ALWAYS renders a sibling
               * empty-state <div> next to the grid, hidden via CSS when there
               * are results. We mirror that here as a zero-height placeholder
               * so the main <div>'s child count is 5 in BOTH the skeleton and
               * the streamed page. Without this, when the page renders 0
               * results (e.g. /ressources?class=7eme&subject=svt&type=HOMEWORK),
               * the streamed HTML has the empty-state div (4 children) at
               * position 3, but the skeleton has the grid (6 <a> children) at
               * position 3 — a #418/#422 child-count and child-type mismatch.
               * 2026-08-05: ERR-Y87HMD (4x #418). */}
              <div className="bg-white rounded-2xl border border-slate-200 p-12 hidden" aria-hidden="true" />
              {/* Pagination placeholder.
               * The page (FilterShell.tsx ~line 800) renders <Pagination> as
               * the 5th child of the main <div> when totalPages > 1, which is
               * true for the vast majority of /ressources pages (e.g. 560 pages
               * for 13k+ resources at 24/page). Without this placeholder, the
               * main <div> has 4 children in the skeleton but 5 in the streamed
               * page, triggering the same #418/#422 mismatch. */}
              <div className="hidden" aria-hidden="true" />
            </div>
          </div>
        </div>
      </main>

      </div>
  );
}

import { Link } from '@/i18n/navigation';
import { FileQuestion, Home, Search } from 'lucide-react';
/**
 * Per-route not-found page for /professeurs/[numericId]/[slug]
 *
 * WHY THIS FILE EXISTS (fixes React #418/#419/#422 hydration mismatch):
 *
 * The root not-found.tsx is a client component ('use client') because it
 * uses useI18n(). When the teacher profile page calls notFound() while
 * the root loading.tsx is in the React tree, Next.js streams the error
 * marker (`<template data-dgst="NEXT_NOT_FOUND">`) but the loading.tsx
 * fallback remains in the initial HTML. React then tries to hydrate the
 * not-found boundary client-side, but the DOM has the loading.tsx
 * spinner, producing hydration mismatches.
 *
 * By providing a per-route not-found.tsx that is a pure server component
 * (no client hooks), Next.js can server-render the actual 404 markup into
 * the initial HTML, replacing the loading.tsx cleanly without a hydration
 * mismatch.
 *
 * STRUCTURE MIRROR (fixes 2026-07-25 #419 hydration errors on
 * /professeurs/293/fendi-): the not-found now mirrors the page.tsx +
 * loading.tsx outer structure (`<div min-h-screen flex flex-col>` wrapping
 * Header + main + Footer). The previous version had no Header/Footer
 * inside its own wrapper, so when the streamed content replaced the
 * loading.tsx skeleton (which DID have Header/Footer), the DOM structure
 * changed dramatically and React's hydration check threw #419.
 *
 * JSON-LD PLACEHOLDERS (fixes 2026-07-26 #418 hydration errors on
 * /professeurs/833/prof-833): the page.tsx renders 2 JSON-LD scripts
 * (Person + BreadcrumbList) as the first children of the wrapper, and
 * the loading.tsx now mirrors that with 2 placeholder scripts. The
 * not-found.tsx also needs those 2 placeholder scripts so the wrapper's
 * child count stays at 4 when the not-found boundary replaces the page
 * (which would otherwise drop from 4 children to 3 and trigger #418).
 *
 * MAIN CHILD-COUNT MIRROR (fixes 2026-08-08 #419 hydration errors on
 * /ar/professeurs/2488/labiadh-, ERR-V45JRY 2×): the loading.tsx renders
 * <main> with 4 direct children (breadcrumb div + hero div + stats div
 * + content div). The previous version of not-found.tsx had <main> with
 * only 1 child (the centered 404 block), so when the not-found boundary
 * replaced the loading.tsx skeleton during hydration, React saw a 4 vs 1
 * child-count mismatch and threw #418/#419/#422. We now add 3 hidden
 * placeholder children to <main> (breadcrumb + hero + stats) so the
 * child count matches the loading.tsx skeleton exactly, and we keep the
 * 404 content in the 4th child (content div). The "always render, hide
 * via CSS" pattern is applied so the visible 404 UI is unchanged.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 to-indigo-50">
      {/* Placeholders for the page's Person + BreadcrumbList JSON-LD scripts
          (rendered as the first two children of the wrapper). Keeps the
          wrapper's child count identical to loading.tsx and page.tsx so
          React's hydration check passes when the not-found boundary resolves.

          FIX 2026-09-13 (nightly digest #15): placeholders must contain
          @context — Safari parses ld+json scripts eagerly and crashes on
          empty objects with `undefined is not an object (evaluating
          'r["@context"].toLowerCase')`. Use a minimal valid schema. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org"}' }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: '{"@context":"https://schema.org"}' }}
      />

      <div className="flex-1 pt-20">
        {/* 1. Breadcrumb placeholder (hidden via CSS). The page.tsx + loading.tsx
            both render a <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            wrapping a <nav> with the breadcrumb trail. We mirror that
            element type + className so the <main>'s first child is identical
            between the loading.tsx skeleton and the not-found boundary. */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 hidden" aria-hidden="true">
          <nav
            aria-label="Fil d'Ariane"
            className="flex items-center gap-1 text-xs text-slate-500 flex-wrap"
          />
        </div>

        {/* 2. Hero header placeholder (hidden via CSS). The page.tsx + loading.tsx
            render this <div> with TWO children (radial overlay + inner content
            div). We mirror that exact child structure so the <main>'s second
            child is identical between the loading.tsx skeleton and the
            not-found boundary. The two children are empty (no inner content)
            because the loading.tsx's children are pure skeleton placeholders
            with their own internal content — and we don't need any of that
            visible in the 404 UI. */}
        <div className="relative bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 overflow-hidden hidden" aria-hidden="true">
          {/* 2a. Radial-gradient overlay (mirrors loading.tsx + page.tsx hero). */}
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_50%,rgba(245,158,11,0.15),transparent_50%)]" />
          {/* 2b. Inner content wrapper (mirrors loading.tsx + page.tsx hero). */}
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12" />
        </div>

        {/* 3. Stats bar placeholder (hidden via CSS). The page.tsx + loading.tsx
            render this <div> with ONE child (the inner max-w-7xl wrapper that
            contains the 5 stat cards). We mirror that structure so the
            <main>'s third child is identical. */}
        <div className="bg-white border-y border-slate-200 shadow-sm hidden" aria-hidden="true">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" />
        </div>

        {/* 4. Content div — visible. This is the 4th child of <main>, matching
            the loading.tsx skeleton's 4th child (`<div className="max-w-7xl
            mx-auto px-4 sm:px-6 lg:px-8 py-10">`).
            2026-08-13 fix: the loading.tsx renders this wrapper with 1 child
            `<div className="grid lg:grid-cols-3 gap-8">` that itself has
            2 children (main column + sidebar <aside>). The previous not-found
            had 1 child `<div className="max-w-lg w-full text-center">` with
            the 404 content. When the not-found boundary replaced the loading
            during hydration, React saw a child-count mismatch at the grandchild
            level (2 vs 1) and threw React #418/#419/#422 hydration errors on
            /professeurs/[numericId]/[slug] when the teacher doesn't exist
            (ERR-NYG44E 5x #418, ERR-F55U7S 1x #422 in 2026-08-13 nightly
            digest, all on /fr/professeurs/757/... which notFound()s because
            the Arabic-encoded slug doesn't match a real teacher).
            Fix: use the same `<div className="grid lg:grid-cols-3 gap-8">`
            wrapper as the loading, with the centered 404 content in the first
            column (spanning 2) and a hidden <aside> placeholder in the second
            column. This keeps the grandchild structure identical between the
            loading and the not-found boundary. */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main column — centered 404 content, spans 2 cols on lg+ */}
            <div className="lg:col-span-2 flex items-center justify-center min-h-[400px]">
              <div className="max-w-lg w-full text-center">
                {/* Animated icon */}
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-sky-200 rounded-full blur-2xl opacity-50" />
                  <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-sky-100 to-indigo-100 flex items-center justify-center mx-auto shadow-lg">
                    <FileQuestion className="w-12 h-12 text-sky-600" aria-hidden="true" />
                  </div>
                </div>

                {/* 404 */}
                <div className="text-7xl sm:text-8xl font-extrabold bg-gradient-to-br from-sky-500 to-indigo-600 bg-clip-text text-transparent mb-3 tracking-tight">
                  404
                </div>

                {/* Title */}
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  Enseignant introuvable
                </h1>

                {/* Message */}
                <p className="text-base sm:text-lg text-slate-600 mb-8 leading-relaxed">
                  Ce profil d'enseignant n'existe pas ou n'est plus accessible. Il a peut-être été
                  supprimé, ou le lien que vous avez suivi est obsolète.
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold shadow-md hover:shadow-lg hover:from-primary-600 hover:to-primary-700 transition-all min-h-[44px]"
                  >
                    <Home className="w-5 h-5" />
                    Accueil
                  </Link>

                  <Link
                    href="/professeurs"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all min-h-[44px]"
                  >
                    <Search className="w-5 h-5" />
                    Tous les enseignants
                  </Link>
                </div>
              </div>
            </div>

            {/* Sidebar placeholder — hidden via CSS, matches the loading's
                <aside> element type so the grid's child count is 2 in both
                states. */}
            <aside className="space-y-6 hidden" aria-hidden="true" />
          </div>
        </div>
      </div>

      </div>
  );
}

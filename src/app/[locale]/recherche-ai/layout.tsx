// @ts-nocheck
/**
 * /fr/recherche-ai · layout (server component)
 *
 * 2026-10-08 v3:
 * - generateMetadata here (page is 'use client')
 * - Loads KaTeX CSS + auto-render extension on the client
 *   so LaTeX in the LLM answer renders as proper math
 * - Renders the client page below
 */

import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import Script from 'next/script';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isAr = locale === 'ar';
  return {
    title: isAr ? 'بحث ذكي | إكسامانت' : 'Recherche IA | Examanet',
    description: isAr
      ? 'ابحث في 14 000+ مورد تربوي بالعربية أو الفرنسية. مدعوم بـ Cloudflare AI Search.'
      : 'Recherche sémantique dans 14 000+ ressources pédagogiques. FR / AR / darija. Propulsé par Cloudflare AI Search.',
    alternates: { canonical: isAr ? '/ar/recherche-ai' : '/fr/recherche-ai' },
    robots: { index: false, follow: true },
    openGraph: {
      title: isAr ? 'بحث ذكي' : 'Recherche IA',
      description: isAr
        ? 'ابحث في 14 000+ مورد تربوي.'
        : 'Recherche sémantique dans 14 000+ ressources.',
      type: 'website',
      locale: isAr ? 'ar_TN' : 'fr_TN',
    },
  };
}

export default function RechercheAiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* KaTeX for LaTeX formula rendering in LLM answers.
          Loaded from jsDelivr CDN; ~120KB total (CSS + JS + auto-render).
          Math delimiters supported: \(...\), \[...\], $$...$$, $...$ */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
        integrity="sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+"
        crossOrigin="anonymous"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"
        integrity="sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc8xDLKZ8ptsPPj7Rts9XWZA3F/0S7NVW+7"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
        integrity="sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7AGUxm1BFMsXTykdyo8epp3kQhtm2G1MT2s"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <Script id="katex-init" strategy="afterInteractive">{`
        // Initialise KaTeX auto-render when the LLM answer is mounted.
        // We re-run on every result change (the page triggers a custom event).
        function renderKatex() {
          if (typeof renderMathInElement !== 'undefined') {
            const el = document.getElementById('ai-answer-body');
            if (el) {
              renderMathInElement(el, {
                delimiters: [
                  { left: '$$', right: '$$', display: true },
                  { left: '$', right: '$', display: false },
                  { left: '\\\\[', right: '\\\\]', display: true },
                  { left: '\\\\(', right: '\\\\)', display: false },
                ],
                throwOnError: false,
                errorColor: '#dc2626',
              });
            }
          }
        }
        window.addEventListener('ai-answer-rendered', renderKatex);
        // Also run once on initial load (in case the script loads after)
        if (document.readyState === 'complete') renderKatex();
        else window.addEventListener('load', renderKatex);
      `}</Script>
      {children}
    </>
  );
}

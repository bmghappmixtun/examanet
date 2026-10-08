// @ts-nocheck
/**
 * /fr/recherche-ai · layout (server component)
 *
 * 2026-10-08 v4:
 * - generateMetadata here (page is 'use client')
 * - Loads KaTeX via PLAIN HTML <script> tags (next/script's
 *   strategy="afterInteractive" didn't render in our server-component
 *   layout — only preloads appeared in HTML, not the actual scripts).
 *   With plain <script src="..."> the browser loads them on parse.
 * - Renders the client page below
 */

import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';

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
          Plain <script src> tags load synchronously during HTML parse.
          ~120KB total (CSS + JS + auto-render extension) from jsDelivr.
          Math delimiters supported: \(...\), \[...\], $$...$$, $...$ */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
        integrity="sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+"
        crossOrigin="anonymous"
      />
      <script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"
        integrity="sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc8xDLKZ8ptsPPj7Rts9XWZA3F/0S7NVW+7"
        crossOrigin="anonymous"
        defer
      />
      <script
        src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
        integrity="sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7AGUxm1BFMsXTykdyo8epp3kQhtm2G1MT2s"
        crossOrigin="anonymous"
        defer
      />
      {children}
    </>
  );
}

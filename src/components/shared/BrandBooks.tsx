/**
 * BrandBooks — the 3-books illustration for the homepage hero card.
 *
 * 2026-10-21: replaced the 📚 emoji with a custom SVG stack.
 *
 * WHY: the emoji is a bitmap rendered by the OS. On the new orange→teal
 * gradient (variant A) the emoji's green + blue books disappeared into
 * the teal half, and the red book fought with the orange. The emoji also
 * rendered differently on every platform (Apple vs Windows vs Android).
 *
 * A custom SVG gives:
 *  - deterministic rendering on every OS/browser
 *  - colors chosen to POP against the orange (#F0913E) → teal (#006078)
 *    gradient, i.e. cream + deep navy + rose, none of which exist in
 *    the gradient itself
 *  - a soft drop-shadow so the stack separates from the background
 *  - a tiny SVG (≈2 KB) instead of a font glyph fallback
 *
 * The emoji look (3 books fanned out, spines on the left, visible page
 * edges) is preserved so the card doesn't change shape.
 */

import type { CSSProperties } from 'react';

export type BrandBooksPalette = {
  /** Left book cover + spine */
  left: string;
  leftDark: string;
  /** Center book cover + spine */
  center: string;
  centerDark: string;
  /** Right book cover + spine */
  right: string;
  rightDark: string;
  /** Page block (front-facing paper) */
  pages: string;
  /** Bookmark ribbon */
  ribbon: string;
};

export const BRAND_BOOKS_PALETTES: Record<string, { label: string; hint: string; colors: BrandBooksPalette }> = {
  contrast: {
    label: 'P1 — Contraste max',
    hint: 'crème + marine + rose → pop sur le dégradé orange/teal',
    colors: {
      left: '#FFF3DC',
      leftDark: '#E4C79A',
      center: '#16263F',
      centerDark: '#0B1526',
      right: '#EE4D8C',
      rightDark: '#B81E5C',
      pages: '#FFFDF6',
      ribbon: '#FCD34D',
    },
  },
  brand: {
    label: 'P2 — Palette marque',
    hint: 'crème + teal brand + orange brand → cohérent avec le logo',
    colors: {
      left: '#FFF3DC',
      leftDark: '#E4C79A',
      center: '#00586E',
      centerDark: '#00384A',
      right: '#F0913E',
      rightDark: '#C25F14',
      pages: '#FFFDF6',
      ribbon: '#FCD34D',
    },
  },
  mono: {
    label: 'P3 — Mono crème',
    hint: 'tout crème avec ombres douces → minimal, très « premium »',
    colors: {
      left: '#FFF6E6',
      leftDark: '#D9C4A4',
      center: '#FFF6E6',
      centerDark: '#D9C4A4',
      right: '#FFF6E6',
      rightDark: '#D9C4A4',
      pages: '#FFFFFF',
      ribbon: '#F0913E',
    },
  },
};

export function BrandBooks({
  palette = 'contrast',
  className = '',
  style,
}: {
  palette?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const p = (BRAND_BOOKS_PALETTES[palette] ?? BRAND_BOOKS_PALETTES.contrast).colors;

  return (
    <svg
      viewBox="0 0 170 140"
      className={className}
      style={style}
      role="img"
      aria-label="Pile de trois livres"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="bb-drop" x="-25%" y="-20%" width="150%" height="160%">
          <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#06121F" floodOpacity="0.38" />
        </filter>
      </defs>

      <g filter="url(#bb-drop)">
        {/* ── LEFT book (leaning left, -13°) ── */}
        <g transform="rotate(-13 47 76)">
          <rect x="27" y="45" width="42" height="62" rx="4" fill={p.leftDark} />
          <rect x="32" y="49" width="31" height="54" rx="2" fill={p.pages} />
          {/* page lines */}
          <rect x="34" y="56" width="27" height="1.5" rx="0.75" fill={p.leftDark} opacity="0.45" />
          <rect x="34" y="62" width="27" height="1.5" rx="0.75" fill={p.leftDark} opacity="0.35" />
          <rect x="34" y="68" width="27" height="1.5" rx="0.75" fill={p.leftDark} opacity="0.45" />
          <rect x="34" y="74" width="27" height="1.5" rx="0.75" fill={p.leftDark} opacity="0.35" />
          {/* spine */}
          <rect x="27" y="45" width="10" height="62" rx="4" fill={p.left} />
          <rect x="29.5" y="52" width="5" height="2.5" rx="1.25" fill={p.leftDark} opacity="0.7" />
          <rect x="29.5" y="98" width="5" height="2.5" rx="1.25" fill={p.leftDark} opacity="0.7" />
        </g>

        {/* ── CENTER book (upright, tallest) ── */}
        <g>
          <rect x="64" y="32" width="46" height="74" rx="4" fill={p.centerDark} />
          <rect x="70" y="37" width="34" height="64" rx="2" fill={p.pages} />
          <rect x="72" y="45" width="30" height="1.5" rx="0.75" fill={p.centerDark} opacity="0.35" />
          <rect x="72" y="52" width="30" height="1.5" rx="0.75" fill={p.centerDark} opacity="0.25" />
          <rect x="72" y="59" width="30" height="1.5" rx="0.75" fill={p.centerDark} opacity="0.35" />
          <rect x="72" y="66" width="30" height="1.5" rx="0.75" fill={p.centerDark} opacity="0.25" />
          {/* spine */}
          <rect x="64" y="32" width="11" height="74" rx="4" fill={p.center} />
          <rect x="67" y="40" width="5.5" height="2.5" rx="1.25" fill={p.pages} opacity="0.8" />
          <rect x="67" y="95" width="5.5" height="2.5" rx="1.25" fill={p.pages} opacity="0.8" />
          {/* bookmark ribbon */}
          <path d="M96 32 h9 v30 l-4.5 -5.5 -4.5 5.5 Z" fill={p.ribbon} />
        </g>

        {/* ── RIGHT book (leaning right, +12°) ── */}
        <g transform="rotate(12 123 76)">
          <rect x="103" y="45" width="42" height="62" rx="4" fill={p.rightDark} />
          <rect x="108" y="49" width="31" height="54" rx="2" fill={p.pages} />
          <rect x="110" y="56" width="27" height="1.5" rx="0.75" fill={p.rightDark} opacity="0.4" />
          <rect x="110" y="62" width="27" height="1.5" rx="0.75" fill={p.rightDark} opacity="0.3" />
          <rect x="110" y="68" width="27" height="1.5" rx="0.75" fill={p.rightDark} opacity="0.4" />
          <rect x="110" y="74" width="27" height="1.5" rx="0.75" fill={p.rightDark} opacity="0.3" />
          {/* spine */}
          <rect x="103" y="45" width="10" height="62" rx="4" fill={p.right} />
          <rect x="105.5" y="52" width="5" height="2.5" rx="1.25" fill={p.rightDark} opacity="0.7" />
          <rect x="105.5" y="98" width="5" height="2.5" rx="1.25" fill={p.rightDark} opacity="0.7" />
        </g>
      </g>
    </svg>
  );
}

export default BrandBooks;

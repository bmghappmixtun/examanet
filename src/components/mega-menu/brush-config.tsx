/**
 * Brush stroke mapping for the Classes mega-menu.
 *
 * 2026-09-19 v4: User-provided SVG brushes (real hand-painted
 * watercolor strokes, not algorithmic). Each brush is a 300x90 SVG
 * with multiple overlapping Bezier paths and varying opacities.
 * The shapes differ slightly between colors (per spec: "Les formes
 * peuvent être légèrement différentes entre elles. NE PAS simplement
 * changer la couleur d'un même rectangle.")
 *
 * Files live in public/brushes/brush-{color}.svg.
 */

export type BrushColor = 'blue' | 'green' | 'yellow' | 'pink' | 'purple' | 'peach' | 'turquoise';

/** Map niveau slug -> brush color. Matches user spec for 7ème→4ème. */
export const BRUSH_BY_NIVEAU_SLUG: Record<string, BrushColor> = {
  '7eme': 'blue',
  '8eme': 'green',
  '9eme': 'yellow',
  '1ere-secondaire': 'pink',
  '2eme-secondaire': 'purple',
  '3eme-secondaire': 'peach',
  '4eme-secondaire': 'turquoise',
};

export const BRUSH_PUBLIC_PATH = (color: BrushColor): string => `/brushes/brush-${color}.svg`;

/**
 * The brush is placed via <img> with absolute positioning so it scales
 * to the text width. We don't fix the dimensions here — let the parent
 * wrapper handle it (see MenuSideDrawer.tsx).
 *
 * IMPORTANT: The SVG is 300x90 viewBox (≈3.33:1 aspect ratio). The
 * user's spec uses `width: calc(100% + 32px)` on the wrapping element
 * with `height: auto` so the brush auto-adapts to the label text length
 * while preserving the aspect ratio.
 */

/**
 * Brush stroke mapping for the Classes mega-menu.
 *
 * 2026-09-19 v3: User asked for a REAL watercolor brush stroke, not a
 * geometric SVG. Generated via scripts/generate_brushes.py using PIL:
 *   - 70+ horizontal directional stripes (the brush fibers)
 *   - Tapered ends (sin envelope)
 *   - Asymmetric body, dry-brush fibres at tips
 *   - Pastel colors with ~70% alpha at center
 *   - 3x retina (1260x285 px for 420x95 logical)
 *
 * Each niveau gets its own PNG brush — user spec says:
 *   "Les formes peuvent être légèrement différentes entre elles.
 *    NE PAS simplement changer la couleur d'un même rectangle."
 * Different per-couleur seeds in the generator give different shapes.
 *
 * Hover state uses CSS transitions (opacity + slight scale).
 */

export type BrushColor = 'blue' | 'green' | 'yellow' | 'pink' | 'purple' | 'peach' | 'turquoise';

/** Map niveau slug -> brush color. Matches the colors used in the original
 * watercolor wash preview (and matches user spec for 7ème→4ème). */
export const BRUSH_BY_NIVEAU_SLUG: Record<string, BrushColor> = {
  '7eme': 'blue',
  '8eme': 'green',
  '9eme': 'yellow',
  '1ere-secondaire': 'pink',
  '2eme-secondaire': 'purple',
  '3eme-secondaire': 'peach',
  '4eme-secondaire': 'turquoise',
};

export const BRUSH_PUBLIC_PATH = (color: BrushColor): string => `/brushes/brush-${color}.png`;

/**
 * The brush is placed via <img> with absolute positioning so it scales
 * to the text width. We don't fix the dimensions here — let the parent
 * <BrushUnderLabel> wrapper handle it (see MenuSideDrawer.tsx).
 *
 * IMPORTANT: We intentionally do NOT set a width/height in pixels here.
 * The user's spec uses `width: calc(100% + 32px)` on the wrapping element
 * so the brush auto-adapts to the label text length. The PNG is rendered
 * at its native 1260x285 retina ratio (≈4.42:1) and the browser will
 * letterbox-fit to the container's actual size.
 */

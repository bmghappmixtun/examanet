'use client';
/**
 * Brush stroke variants for the Classes mega-menu.
 *
 * 9 combinations = 3 color strategies × 3 brush positions:
 *   A. Per cycle   (Collège = mint, Lycée = lavender)
 *   B. Per niveau  (each level has its own pastel)
 *   C. Harmonized  (rotation of pastels, no level repeats)
 *
 *   1. Corner brush       (top-right, blurred circle)
 *   2. Diagonal band      (large band crossing the card)
 *   3. Halo around icon   (left-side blob behind the icon)
 *
 * 2026-09-19: Created so user can preview all 9 on dev and pick one.
 */

// Pastel palette — all tailwind colors with /40 opacity for soft look
const PASTELS = {
  mint: 'bg-emerald-200/50',
  sky: 'bg-sky-200/50',
  lavender: 'bg-violet-200/50',
  rose: 'bg-rose-200/50',
  amber: 'bg-amber-200/50',
  peach: 'bg-orange-200/50',
  lime: 'bg-lime-200/50',
} as const;

// A. Per cycle: Collège → mint, Lycée → lavender
const COLORS_BY_CYCLE = {
  college: PASTELS.mint,
  lycee: PASTELS.lavender,
};

// B. Per niveau: each level gets a distinct pastel
const COLORS_BY_NIVEAU: Record<string, string> = {
  '7eme': PASTELS.mint,
  '8eme': PASTELS.sky,
  '9eme': PASTELS.lime,
  '1ere-secondaire': PASTELS.lavender,
  '2eme-secondaire': PASTELS.rose,
  '3eme-secondaire': PASTELS.amber,
  '4eme-secondaire': PASTELS.peach,
};

// C. Harmonized rotation: each niveau gets a different pastel, cycle-agnostic
const COLORS_HARMONIZED = [
  PASTELS.mint,    // 7eme
  PASTELS.sky,     // 8eme
  PASTELS.lavender, // 9eme
  PASTELS.amber,   // 1AS
  PASTELS.rose,    // 2AS
  PASTELS.lime,    // 3AS
  PASTELS.peach,   // Bac
];

export type ColorStrategy = 'A' | 'B' | 'C';
export type BrushPosition = '1' | '2' | '3';

export type BrushVariant = {
  code: `${ColorStrategy}${BrushPosition}`;
  colorLabel: string;
  positionLabel: string;
  description: string;
  /** Returns the Tailwind background class for a given niveau + cycle */
  getColor: (niveauSlug: string, cycleSlug: 'college' | 'lycee', niveauIndex: number) => string;
  /** Returns the JSX to render (positioned absolutely inside the niveau card) */
  renderBrush: (colorClass: string) => React.ReactNode;
};

export const BRUSH_VARIANTS: BrushVariant[] = [
  // ===== A. Per cycle =====
  {
    code: 'A1',
    colorLabel: 'Par cycle',
    positionLabel: 'Coin haut-droite',
    description: 'Tous les niveaux Collège = mint, Lycée = lavender. Petit cercle flou en haut à droite.',
    getColor: (_slug, cycle) => COLORS_BY_CYCLE[cycle],
    renderBrush: (c) => (
      <div
        className={`absolute -top-6 -right-6 w-24 h-24 ${c} rounded-full blur-2xl pointer-events-none`}
        aria-hidden
      />
    ),
  },
  {
    code: 'A2',
    colorLabel: 'Par cycle',
    positionLabel: 'Bande diagonale',
    description: 'Bande diagonale pastel qui traverse tout le card. Collège = mint, Lycée = lavender.',
    getColor: (_slug, cycle) => COLORS_BY_CYCLE[cycle],
    renderBrush: (c) => (
      <div
        className={`absolute inset-0 ${c} pointer-events-none rounded-xl`}
        style={{ clipPath: 'polygon(85% 0, 100% 0, 30% 100%, 15% 100%)' }}
        aria-hidden
      />
    ),
  },
  {
    code: 'A3',
    colorLabel: 'Par cycle',
    positionLabel: 'Halo derrière icône',
    description: 'Halo pastel flou derrière l\'icône du niveau. Collège = mint, Lycée = lavender.',
    getColor: (_slug, cycle) => COLORS_BY_CYCLE[cycle],
    renderBrush: (c) => (
      <div
        className={`absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 ${c} rounded-full blur-xl pointer-events-none`}
        aria-hidden
      />
    ),
  },
  // ===== B. Per niveau =====
  {
    code: 'B1',
    colorLabel: 'Par niveau',
    positionLabel: 'Coin haut-droite',
    description: 'Chaque niveau a sa propre couleur pastel (7=vert, 8=bleu, 9=lime, 1AS=violet, 2AS=rose, 3AS=ambre, Bac=orange). Cercle flou en haut à droite.',
    getColor: (slug) => COLORS_BY_NIVEAU[slug] ?? PASTELS.mint,
    renderBrush: (c) => (
      <div
        className={`absolute -top-6 -right-6 w-24 h-24 ${c} rounded-full blur-2xl pointer-events-none`}
        aria-hidden
      />
    ),
  },
  {
    code: 'B2',
    colorLabel: 'Par niveau',
    positionLabel: 'Bande diagonale',
    description: 'Bande diagonale colorée selon le niveau (palette arc-en-ciel). Chaque niveau a sa propre couleur.',
    getColor: (slug) => COLORS_BY_NIVEAU[slug] ?? PASTELS.mint,
    renderBrush: (c) => (
      <div
        className={`absolute inset-0 ${c} pointer-events-none rounded-xl`}
        style={{ clipPath: 'polygon(85% 0, 100% 0, 30% 100%, 15% 100%)' }}
        aria-hidden
      />
    ),
  },
  {
    code: 'B3',
    colorLabel: 'Par niveau',
    positionLabel: 'Halo derrière icône',
    description: 'Halo derrière l\'icône, coloré par niveau. Effet discret mais distinctif entre niveaux.',
    getColor: (slug) => COLORS_BY_NIVEAU[slug] ?? PASTELS.mint,
    renderBrush: (c) => (
      <div
        className={`absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 ${c} rounded-full blur-xl pointer-events-none`}
        aria-hidden
      />
    ),
  },
  // ===== C. Harmonized rotation =====
  {
    code: 'C1',
    colorLabel: 'Harmonisée',
    positionLabel: 'Coin haut-droite',
    description: 'Rotation de 7 pastels (chaque niveau une couleur différente, sans répétition visuelle forte). Cercle flou.',
    getColor: (_slug, _cycle, idx) => COLORS_HARMONIZED[idx % COLORS_HARMONIZED.length],
    renderBrush: (c) => (
      <div
        className={`absolute -top-6 -right-6 w-24 h-24 ${c} rounded-full blur-2xl pointer-events-none`}
        aria-hidden
      />
    ),
  },
  {
    code: 'C2',
    colorLabel: 'Harmonisée',
    positionLabel: 'Bande diagonale',
    description: 'Bande diagonale avec rotation de pastels. Plus subtil que B2 car moins contrasté niveau par niveau.',
    getColor: (_slug, _cycle, idx) => COLORS_HARMONIZED[idx % COLORS_HARMONIZED.length],
    renderBrush: (c) => (
      <div
        className={`absolute inset-0 ${c} pointer-events-none rounded-xl`}
        style={{ clipPath: 'polygon(85% 0, 100% 0, 30% 100%, 15% 100%)' }}
        aria-hidden
      />
    ),
  },
  {
    code: 'C3',
    colorLabel: 'Harmonisée',
    positionLabel: 'Halo derrière icône',
    description: 'Halo avec rotation de pastels. Effet le plus discret (3 pastels doux).',
    getColor: (_slug, _cycle, idx) => COLORS_HARMONIZED[idx % COLORS_HARMONIZED.length],
    renderBrush: (c) => (
      <div
        className={`absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 ${c} rounded-full blur-xl pointer-events-none`}
        aria-hidden
      />
    ),
  },
];

export function getBrushVariant(code: string): BrushVariant | undefined {
  return BRUSH_VARIANTS.find((v) => v.code === code);
}

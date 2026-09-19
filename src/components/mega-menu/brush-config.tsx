'use client';
/**
 * Brush stroke variants for the Classes mega-menu.
 *
 * 2026-09-19 v2: User changed the design direction. Instead of
 * abstract geometric shapes (circles, diagonal bands, halos), they
 * want WATERCOLOR WASH style brush strokes — soft, organic, slightly
 * irregular edges, sitting behind the niveau label.
 *
 * 9 combinations = 3 color strategies × 3 brush shapes:
 *   A. Per cycle   (Collège = mint, Lycée = lavender)
 *   B. Per niveau  (each level has its own pastel)
 *   C. Harmonized  (rotation of pastels, no level repeats)
 *
 *   1. Wide horizontal stroke   (single elongated wash behind label)
 *   2. Layered strokes         (2 overlapping washes for depth)
 *   3. Diagonal stroke         (tilted watercolor wash)
 *
 * Reference colors observed in user's attached mockup:
 *   7ème  = sky blue
 *   8ème  = mint/green
 *   9ème  = yellow
 *   1AS   = pink
 *   2AS   = purple
 *   3AS   = peach/orange
 *   Bac   = teal/mint
 */

// Pastel palette mapped to niveau slugs (matches user's mockup intent)
const PASTELS = {
  sky: '#bae6fd',     // sky-300 — 7ème
  mint: '#bbf7d0',    // green-200 — 8ème / Bac
  yellow: '#fef08a',  // yellow-200 — 9ème
  pink: '#fbcfe8',    // pink-200 — 1ère
  purple: '#ddd6fe',  // violet-200 — 2ème
  peach: '#fed7aa',   // orange-200 — 3ème
  teal: '#99f6e4',    // teal-200 — Bac alt
  lavender: '#e9d5ff', // purple-100 — Lycée cycle
} as const;

// A. Per cycle: Collège → mint, Lycée → lavender
const COLORS_BY_CYCLE = {
  college: PASTELS.mint,
  lycee: PASTELS.lavender,
};

// B. Per niveau: each niveau gets a distinct pastel (matches mockup)
const COLORS_BY_NIVEAU: Record<string, string> = {
  '7eme': PASTELS.sky,
  '8eme': PASTELS.mint,
  '9eme': PASTELS.yellow,
  '1ere-secondaire': PASTELS.pink,
  '2eme-secondaire': PASTELS.purple,
  '3eme-secondaire': PASTELS.peach,
  '4eme-secondaire': PASTELS.teal,
};

// C. Harmonized: rotation of pastels, cycle-agnostic
const COLORS_HARMONIZED = [
  PASTELS.sky,     // 7eme
  PASTELS.mint,    // 8eme
  PASTELS.yellow,  // 9eme
  PASTELS.teal,    // 1AS
  PASTELS.pink,    // 2AS
  PASTELS.lavender, // 3AS
  PASTELS.peach,   // Bac
];

export type ColorStrategy = 'A' | 'B' | 'C';
export type BrushShape = '1' | '2' | '3';

export type BrushVariant = {
  code: `${ColorStrategy}${BrushShape}`;
  colorLabel: string;
  shapeLabel: string;
  description: string;
  /** Returns the hex color for a given niveau + cycle */
  getColor: (niveauSlug: string, cycleSlug: 'college' | 'lycee', niveauIndex: number) => string;
  /** Returns the JSX to render (positioned absolutely inside the niveau card) */
  renderBrush: (colorHex: string, niveauSlug?: string, niveauIndex?: number) => React.ReactNode;
};

// ===========================================================================
// SVG path generator for watercolor wash shapes
// ===========================================================================

/**
 * Generate a slightly irregular horizontal "watercolor wash" path.
 * The path has a soft top edge, soft bottom edge, and is wider in the middle
 * to mimic how watercolor actually spreads on paper. We use multiple control
 * points with slight randomization to avoid a perfect geometric look.
 */
function watercolorWashPath(width: number, height: number, seed = 0): string {
  // Deterministic pseudo-random for stable rendering between SSR/CSR
  const rand = (i: number) => {
    const x = Math.sin(seed * 9301 + i * 49297) * 233280;
    return x - Math.floor(x);
  };

  // Top edge (slightly wavy, going right-to-left to make it a closed shape)
  const topY = height * 0.35;
  const botY = height * 0.65;
  const midX = width / 2;
  const midY = height / 2;

  // Build a wavy top edge
  const topPoints: string[] = [];
  for (let i = 0; i <= 8; i++) {
    const x = (i / 8) * width;
    const wobble = (rand(i + 1) - 0.5) * height * 0.15;
    topPoints.push(`${x.toFixed(1)},${(topY + wobble).toFixed(1)}`);
  }

  // Build a wavy bottom edge (reverse direction)
  const botPoints: string[] = [];
  for (let i = 8; i >= 0; i--) {
    const x = (i / 8) * width;
    const wobble = (rand(i + 100) - 0.5) * height * 0.18;
    botPoints.push(`${x.toFixed(1)},${(botY + wobble).toFixed(1)}`);
  }

  // Smooth path using S (cubic Bezier) commands between points
  let path = `M${topPoints[0]}`;
  for (let i = 1; i < topPoints.length; i++) {
    const [x1, y1] = topPoints[i].split(',');
    const [x0, y0] = topPoints[i - 1].split(',');
    const cx1 = (parseFloat(x0) + parseFloat(x1)) / 2;
    path += ` Q${cx1.toFixed(1)},${y0} ${x1},${y1}`;
  }
  // Connect top to bottom
  path += ` L${botPoints[0]}`;
  for (let i = 1; i < botPoints.length; i++) {
    const [x1, y1] = botPoints[i].split(',');
    const [x0, y0] = botPoints[i - 1].split(',');
    const cx1 = (parseFloat(x0) + parseFloat(x1)) / 2;
    path += ` Q${cx1.toFixed(1)},${y0} ${x1},${y1}`;
  }
  path += ' Z';

  return path;
}

/**
 * Generate a tilted (rotated) watercolor wash path.
 */
function tiltedWashPath(width: number, height: number, seed = 0): string {
  const base = watercolorWashPath(width, height, seed);
  return base; // tilt is applied via CSS transform
}

/**
 * Generate a smaller secondary wash for layered strokes.
 */
function secondaryWashPath(width: number, height: number, seed = 0): string {
  const rand = (i: number) => {
    const x = Math.sin(seed * 7919 + i * 31337) * 233280;
    return x - Math.floor(x);
  };

  // Smaller, offset blob
  const topY = height * 0.4;
  const botY = height * 0.7;
  const topPoints: string[] = [];
  for (let i = 0; i <= 6; i++) {
    const x = (i / 6) * width * 0.8 + width * 0.15;
    const wobble = (rand(i + 5) - 0.5) * height * 0.12;
    topPoints.push(`${x.toFixed(1)},${(topY + wobble).toFixed(1)}`);
  }
  const botPoints: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const x = (i / 6) * width * 0.8 + width * 0.15;
    const wobble = (rand(i + 200) - 0.5) * height * 0.15;
    botPoints.push(`${x.toFixed(1)},${(botY + wobble).toFixed(1)}`);
  }

  let path = `M${topPoints[0]}`;
  for (let i = 1; i < topPoints.length; i++) {
    const [x1, y1] = topPoints[i].split(',');
    const [x0, y0] = topPoints[i - 1].split(',');
    const cx1 = (parseFloat(x0) + parseFloat(x1)) / 2;
    path += ` Q${cx1.toFixed(1)},${y0} ${x1},${y1}`;
  }
  path += ` L${botPoints[0]}`;
  for (let i = 1; i < botPoints.length; i++) {
    const [x1, y1] = botPoints[i].split(',');
    const [x0, y0] = botPoints[i - 1].split(',');
    const cx1 = (parseFloat(x0) + parseFloat(x1)) / 2;
    path += ` Q${cx1.toFixed(1)},${y0} ${x1},${y1}`;
  }
  path += ' Z';

  return path;
}

// ===========================================================================
// Brush shape renderers
// ===========================================================================

function WatercolorStroke1({ color, seed = 0 }: { color: string; seed?: number }) {
  // 1. Wide horizontal stroke — single elongated wash behind label
  const path = watercolorWashPath(280, 80, seed);
  return (
    <svg
      viewBox="0 0 280 80"
      preserveAspectRatio="none"
      className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-24 pointer-events-none"
      aria-hidden
    >
      <path
        d={path}
        fill={color}
        fillOpacity="0.55"
      />
    </svg>
  );
}

function WatercolorStroke2({ color, seed = 0 }: { color: string; seed?: number }) {
  // 2. Layered strokes — 2 overlapping washes (one big, one smaller offset)
  const mainPath = watercolorWashPath(280, 80, seed);
  const subPath = secondaryWashPath(280, 80, seed + 99);
  return (
    <>
      <svg
        viewBox="0 0 280 80"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-24 pointer-events-none"
        aria-hidden
      >
        <path
          d={mainPath}
          fill={color}
          fillOpacity="0.5"
        />
      </svg>
      <svg
        viewBox="0 0 280 80"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-1/2 -translate-y-1/3 w-full h-20 pointer-events-none mix-blend-multiply"
        aria-hidden
      >
        <path
          d={subPath}
          fill={color}
          fillOpacity="0.4"
          transform="translate(20 0)"
        />
      </svg>
    </>
  );
}

function WatercolorStroke3({ color, seed = 0 }: { color: string; seed?: number }) {
  // 3. Diagonal stroke — tilted watercolor wash (more dynamic feel)
  const path = tiltedWashPath(280, 80, seed);
  return (
    <svg
      viewBox="0 0 280 80"
      preserveAspectRatio="none"
      className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-24 pointer-events-none"
      style={{ transform: 'translateY(-50%) rotate(-4deg)' }}
      aria-hidden
    >
      <path
        d={path}
        fill={color}
        fillOpacity="0.6"
      />
    </svg>
  );
}

// ===========================================================================
// Variant registry
// ===========================================================================

export const BRUSH_VARIANTS: BrushVariant[] = [
  // ===== A. Per cycle =====
  {
    code: 'A1',
    colorLabel: 'Par cycle',
    shapeLabel: 'Watercolor horizontal',
    description: 'Tous les niveaux Collège = mint, Lycée = lavender. Trait horizontal aquarelle derrière le label.',
    getColor: (_slug, cycle) => COLORS_BY_CYCLE[cycle],
    renderBrush: (c) => <WatercolorStroke1 color={c} seed={1} />,
  },
  {
    code: 'A2',
    colorLabel: 'Par cycle',
    shapeLabel: 'Watercolor superposé',
    description: 'B. Per cycle — 2 traits aquarelle superposés pour effet de profondeur.',
    getColor: (_slug, cycle) => COLORS_BY_CYCLE[cycle],
    renderBrush: (c) => <WatercolorStroke2 color={c} seed={2} />,
  },
  {
    code: 'A3',
    colorLabel: 'Par cycle',
    shapeLabel: 'Watercolor incliné',
    description: 'B. Per cycle — trait aquarelle incliné (-4°) pour effet dynamique.',
    getColor: (_slug, cycle) => COLORS_BY_CYCLE[cycle],
    renderBrush: (c) => <WatercolorStroke3 color={c} seed={3} />,
  },
  // ===== B. Per niveau =====
  {
    code: 'B1',
    colorLabel: 'Par niveau',
    shapeLabel: 'Watercolor horizontal',
    description: 'Chaque niveau a sa propre couleur (sky/mint/yellow/pink/purple/peach/teal). Trait horizontal.',
    getColor: (slug) => COLORS_BY_NIVEAU[slug] ?? PASTELS.mint,
    renderBrush: (c, _slug = "", idx = 0) => <WatercolorStroke1 color={c} seed={idx + 10} />,
  },
  {
    code: 'B2',
    colorLabel: 'Par niveau',
    shapeLabel: 'Watercolor superposé',
    description: 'B. Per niveau — 2 traits aquarelle superposés, chaque niveau sa couleur.',
    getColor: (slug) => COLORS_BY_NIVEAU[slug] ?? PASTELS.mint,
    renderBrush: (c, _slug = "", idx = 0) => <WatercolorStroke2 color={c} seed={idx + 20} />,
  },
  {
    code: 'B3',
    colorLabel: 'Par niveau',
    shapeLabel: 'Watercolor incliné',
    description: 'B. Per niveau — trait aquarelle incliné, chaque niveau sa couleur.',
    getColor: (slug) => COLORS_BY_NIVEAU[slug] ?? PASTELS.mint,
    renderBrush: (c, _slug = "", idx = 0) => <WatercolorStroke3 color={c} seed={idx + 30} />,
  },
  // ===== C. Harmonized rotation =====
  {
    code: 'C1',
    colorLabel: 'Harmonisée',
    shapeLabel: 'Watercolor horizontal',
    description: 'Rotation de 7 pastels (chaque niveau une couleur différente). Trait horizontal.',
    getColor: (_slug, _cycle, idx) => COLORS_HARMONIZED[idx % COLORS_HARMONIZED.length],
    renderBrush: (c, _slug = "", idx = 0) => <WatercolorStroke1 color={c} seed={idx + 100} />,
  },
  {
    code: 'C2',
    colorLabel: 'Harmonisée',
    shapeLabel: 'Watercolor superposé',
    description: 'Rotation de pastels + traits superposés pour effet riche.',
    getColor: (_slug, _cycle, idx) => COLORS_HARMONIZED[idx % COLORS_HARMONIZED.length],
    renderBrush: (c, _slug = "", idx = 0) => <WatercolorStroke2 color={c} seed={idx + 200} />,
  },
  {
    code: 'C3',
    colorLabel: 'Harmonisée',
    shapeLabel: 'Watercolor incliné',
    description: 'Rotation de pastels + trait incliné — effet le plus vivant.',
    getColor: (_slug, _cycle, idx) => COLORS_HARMONIZED[idx % COLORS_HARMONIZED.length],
    renderBrush: (c, _slug = "", idx = 0) => <WatercolorStroke3 color={c} seed={idx + 300} />,
  },
];

export function getBrushVariant(code: string): BrushVariant | undefined {
  return BRUSH_VARIANTS.find((v) => v.code === code);
}

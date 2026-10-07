'use client';

import styles from '@/components/preview-devoirs2/apex-devoirs.module.css';

interface IconProps {
  className?: string;
}

/* ===================== MATH ICONS ===================== */
const SigmaIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 5H9.5L15 12L9.5 19H18" />
  </svg>
);
const PiIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4v16M15 4l3 16M4 4h12" />
  </svg>
);
const SqrtIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 19h4l3-8 4 6 1-2h6" />
  </svg>
);
const IntegralIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 20s2-1 2-12-2-4 2-8M21 20s-2-1-2-12 2-4-2-8" />
  </svg>
);
const InfinityIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18.178 8c-2.105 0-3.155 1.654-4.178 4-1.022 2.346-1.61 4-3.715 4s-2.693-1.654-3.715-4C5.488 9.654 4.437 8 2.332 8M21.668 16c-2.105 0-3.155-1.654-4.178-4-1.022-2.346-1.61-4-3.715-4s-2.693 1.654-3.715 4c-1.023 2.346-2.073 4-4.178 4" />
  </svg>
);
const FunctionIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 20s-3-1-3-8 3-8 3-8M18 20s3-1 3-8-3-8-3-8M15 4l-6 16" />
  </svg>
);
const DivideIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="6" r="1.5" />
    <path d="M5 12h14M12 18l-2-4M12 18l2-4" />
    <circle cx="12" cy="18" r="1.5" />
  </svg>
);
const TriangleIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4L22 20H2L12 4z" />
  </svg>
);
const CompassIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16 8 14 14 8 16 10 10" />
  </svg>
);
const RulerIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 16l5 5 13-13-5-5L3 16zM7 14l1 1M10 11l2 2M13 8l1 1" />
  </svg>
);
const CalculatorIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01M9 18h6" />
  </svg>
);
const BookIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4h6a3 3 0 013 3v13M20 4h-6a3 3 0 00-3 3v13" />
  </svg>
);

/* ===================== PHYSIQUE ICONS ===================== */
const AtomIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="2" />
    <ellipse cx="12" cy="12" rx="10" ry="4" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
  </svg>
);
const BoltIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);
const MagnetIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 4v8a7 7 0 0014 0V4M5 4h4M15 4h4M5 8h4M15 8h4" />
  </svg>
);
const MicroscopeIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 18h10M9 2v6M9 14a3 3 0 003 3h2M9 8h6l3 6h-3" />
    <circle cx="15" cy="14" r="2" />
  </svg>
);
const WaveIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />
  </svg>
);

/* ===================== SVT ICONS ===================== */
const DnaIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 4c5 0 5 16 5 16M14 4c5 0 5 16 5 16M5 8h14M5 16h14" />
  </svg>
);
const LeafIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21c0-9 6-15 18-18-3 12-9 18-18 18z" />
  </svg>
);
const ButterflyIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 12v8M5 12c0-4 3-5 7-5s7 1 7 5-3 5-7 5-7-1-7-5z" />
  </svg>
);

/* ===================== LETTRES ICONS ===================== */
const PencilIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
  </svg>
);
const LibraryIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="6" width="4" height="14" rx="1" />
    <rect x="9" y="6" width="4" height="14" rx="1" />
    <rect x="15" y="6" width="4" height="14" rx="1" />
  </svg>
);
const QuillIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2L4 14v6h6L20 8" />
  </svg>
);
const LetterA = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 20l6-16 6 16M9 14h6" />
  </svg>
);
const LetterB = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 20V4h-3a4 4 0 000 8M6 12h5a4 4 0 010 8" />
  </svg>
);
const LetterC = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 9a5 5 0 00-5-5 6 6 0 000 12 5 5 0 005-2" />
  </svg>
);

/* ===================== HISTOIRE / GEO ICONS ===================== */
const GlobeIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2c3 4 3 16 0 20M12 2c-3 4-3 16 0 20" />
  </svg>
);
const MapIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
  </svg>
);
const MountainIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 20l6-12 4 8 3-4 5 8H3z" />
  </svg>
);
const ColumnIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 4h12M6 20h12M5 4v16M19 4v16" />
  </svg>
);

/* ===================== PHILOSOPHIE / EDUCATION CIVIQUE ===================== */
const TempleIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10l9-7 9 7M5 10v10h14V10M9 20v-6h6v6" />
  </svg>
);
const ThoughtIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12c0-5-4-9-9-9s-9 4-9 9c0 3 1 5 3 7v3h12v-3c2-2 3-4 3-7zM9 22h6" />
  </svg>
);
const ScalesIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v18M4 8l8-4 8 4M2 14l4-8 4 8M14 14l4-8 4 8M2 14h6M14 14h6" />
  </svg>
);

/* ===================== INFORMATIQUE / TIC ===================== */
const KeyboardIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </svg>
);
const ScreenIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
const CodeIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 18l6-6-6-6M8 6l-6 6 6 6M14 4l-4 16" />
  </svg>
);
const BracketIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 4H5v14h3M16 4h3v14h-3" />
  </svg>
);
const DatabaseIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
  </svg>
);
const NetworkIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="2" />
    <circle cx="4" cy="4" r="2" />
    <circle cx="20" cy="4" r="2" />
    <path d="M12 12L4 4M12 12l8-8" />
  </svg>
);
const ServerIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="6" rx="1" />
    <rect x="3" y="14" width="18" height="6" rx="1" />
  </svg>
);

/* ===================== TECHNOLOGIE / GENIE ===================== */
const GearIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 00-.2-1.7l2-1.6-2-3.4-2.4.9a7 7 0 00-3-1.7L13 2h-2l-.4 2.5a7 7 0 00-3 1.7L5.2 5.3l-2 3.4 2 1.6A7 7 0 005 12c0 .6.1 1.1.2 1.7l-2 1.6 2 3.4 2.4-.9a7 7 0 003 1.7L11 22h2l.4-2.5a7 7 0 003-1.7l2.4.9 2-3.4-2-1.6c.1-.6.2-1.1.2-1.7z" />
  </svg>
);
const WrenchIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 6l4-4 4 4-4 4M14 6l-8 8a3 3 0 11-4-4l8-8" />
  </svg>
);

/* ===================== ECO / GESTION ===================== */
const ChartIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21h18M5 17l5-7 4 4 5-9" />
  </svg>
);
const MoneyIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v12M15 9h-4a2 2 0 100 4h2a2 2 0 010 4h-4" />
  </svg>
);

/* ===================== RELIGION / EDUCATION ===================== */
const MoonStarIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.5A9 9 0 0111.5 3a7 7 0 0010 10z" />
  </svg>
);
const MosqueIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 21V11a8 8 0 0116 0v10M4 21h16M9 21v-5a3 3 0 016 0" />
  </svg>
);

/* ===================== ARTS / MUSIQUE / THEATRE ===================== */
const PaletteIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22a10 10 0 110-20c5 0 9 4 9 9 0 3-2 5-5 5h-2a2 2 0 00-2 2v2" />
  </svg>
);
const BrushIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20c2-4 4-4 6 0s4 4 6 0M14 6l4-4 4 4-4 4M14 6l-8 8" />
  </svg>
);
const MaskIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8c2-2 4-2 5 0s4 2 5 0 3-2 5 0v4c0 5-3 10-7 10s-7-5-7-10V8z" />
  </svg>
);
const StarIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2l3 7h7l-5.5 4 2 8L12 17l-6.5 4 2-8L2 9h7z" />
  </svg>
);
const NoteIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V5l12-2v13M21 16a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

/* ===================== SUBJECT → ICON SET MAPPING ===================== */

type IconComponent = (props: IconProps) => React.ReactElement;

const MATH: IconComponent[] = [SigmaIcon, PiIcon, SqrtIcon, IntegralIcon, InfinityIcon, FunctionIcon, DivideIcon, TriangleIcon, CompassIcon, RulerIcon, CalculatorIcon, BookIcon];
const PHYSIQUE: IconComponent[] = [AtomIcon, BoltIcon, MagnetIcon, MicroscopeIcon, WaveIcon, TriangleIcon, InfinityIcon, AtomIcon, BoltIcon];
const SVT: IconComponent[] = [DnaIcon, LeafIcon, ButterflyIcon, WaveIcon, AtomIcon, LeafIcon, DnaIcon, ButterflyIcon, LeafIcon];
const FRANCAIS: IconComponent[] = [BookIcon, PencilIcon, LibraryIcon, QuillIcon, LetterA, LetterB, LetterC, BookIcon, QuillIcon];
const ANGLAIS: IconComponent[] = [LetterA, LetterB, LetterC, BookIcon, QuillIcon, PencilIcon, LibraryIcon, LetterA, LetterB];
const ARABE: IconComponent[] = [BookIcon, QuillIcon, LibraryIcon, StarIcon, BookIcon, PencilIcon, QuillIcon, LibraryIcon, BookIcon];
const HISTOIRE: IconComponent[] = [GlobeIcon, MapIcon, MountainIcon, ColumnIcon, BookIcon, QuillIcon, MapIcon, GlobeIcon, ColumnIcon];
const GEOGRAPHIE: IconComponent[] = [GlobeIcon, MapIcon, MountainIcon, LeafIcon, GlobeIcon, MapIcon, MountainIcon, MapIcon, GlobeIcon];
const PHILOSOPHIE: IconComponent[] = [TempleIcon, ThoughtIcon, ScalesIcon, QuillIcon, BookIcon, TempleIcon, ThoughtIcon, ScalesIcon, QuillIcon];
const INFORMA: IconComponent[] = [ScreenIcon, KeyboardIcon, CodeIcon, BracketIcon, DatabaseIcon, NetworkIcon, ServerIcon, BracketIcon, CodeIcon];
const TECHNOLOGIE: IconComponent[] = [GearIcon, WrenchIcon, BoltIcon, MicroscopeIcon, AtomIcon, InfinityIcon, GearIcon, WrenchIcon, BoltIcon];
const ECO_GESTION: IconComponent[] = [ChartIcon, MoneyIcon, ChartIcon, MoneyIcon, ChartIcon, MoneyIcon, ChartIcon, MoneyIcon, ChartIcon];
const RELIGION: IconComponent[] = [MoonStarIcon, MosqueIcon, BookIcon, StarIcon, MoonStarIcon, MosqueIcon, BookIcon, StarIcon, MoonStarIcon];
const ARTS: IconComponent[] = [PaletteIcon, BrushIcon, PaletteIcon, BrushIcon, StarIcon, PaletteIcon, BrushIcon, StarIcon, BrushIcon];
const MUSIQUE: IconComponent[] = [NoteIcon, NoteIcon, NoteIcon, StarIcon, NoteIcon, NoteIcon, NoteIcon, StarIcon, NoteIcon];
const THEATRE: IconComponent[] = [MaskIcon, StarIcon, MaskIcon, MaskIcon, StarIcon, MaskIcon, StarIcon, MaskIcon, MaskIcon];
const GENIE_ELEC: IconComponent[] = [BoltIcon, BoltIcon, BoltIcon, MagnetIcon, WaveIcon, BoltIcon, BoltIcon, BoltIcon, AtomIcon];

const ICON_SETS: Record<string, IconComponent[]> = {
  // Collège
  francais: FRANCAIS,
  anglais: ANGLAIS,
  informatique: INFORMA,
  arabe: ARABE,
  mathematiques: MATH,
  physique: PHYSIQUE,
  svt: SVT,
  'histoire-geographie': HISTOIRE,
  'education-islamique': RELIGION,
  'education-civique': PHILOSOPHIE,
  technologie: TECHNOLOGIE,
  'education-artistique': ARTS,
  musique: MUSIQUE,
  // Lycée
  philosophie: PHILOSOPHIE,
  histoire: HISTOIRE,
  geographie: GEOGRAPHIE,
  'pensee-islamique': RELIGION,
  'algo-prog': [BracketIcon, CodeIcon, ScreenIcon, KeyboardIcon, FunctionIcon, BracketIcon, CodeIcon, ScreenIcon, KeyboardIcon],
  'bases-donnees': [DatabaseIcon, ServerIcon, CodeIcon, BracketIcon, DatabaseIcon, ScreenIcon, BracketIcon, ServerIcon, CodeIcon],
  tic: [NetworkIcon, GlobeIcon, ScreenIcon, NetworkIcon, GlobeIcon, ScreenIcon, NetworkIcon, GlobeIcon, NetworkIcon],
  'systeme-exploitation-reseaux': [ServerIcon, NetworkIcon, ScreenIcon, DatabaseIcon, ServerIcon, NetworkIcon, ScreenIcon, KeyboardIcon, BracketIcon],
  economie: ECO_GESTION,
  gestion: ECO_GESTION,
  'genie-electrique': GENIE_ELEC,
  theatre: THEATRE,
  '3eme-langue-allemand': [LetterB, LetterA, BookIcon, QuillIcon, PencilIcon, LibraryIcon, LetterB, LetterA, QuillIcon],
  '3eme-langue-italien': [LetterC, LetterA, BookIcon, QuillIcon, PencilIcon, LibraryIcon, LetterC, LetterA, QuillIcon],
  '3eme-langue-espagnol': [LetterC, LetterA, BookIcon, PencilIcon, QuillIcon, LibraryIcon, LetterC, LetterA, QuillIcon],
  'sciences-techniques': [AtomIcon, BoltIcon, GearIcon, WrenchIcon, TriangleIcon, AtomIcon, BoltIcon, GearIcon, WrenchIcon],
  'etude-de-texte': FRANCAIS,
};

const FALLBACK_ICONS = MATH;

interface IconPos {
  Icon: IconComponent;
  top: string;
  left: string;
  size: number;
  rotate: number;
  delay: number;
}

const POSITIONS: Array<Omit<IconPos, 'Icon'>> = [
  { top: '14%', left: '70%', size: 64, rotate: 12, delay: 0.3 },
  { top: '28%', left: '88%', size: 52, rotate: -15, delay: 1.1 },
  { top: '38%', left: '56%', size: 60, rotate: 8, delay: 2.2 },
  { top: '50%', left: '78%', size: 84, rotate: -20, delay: 0.5 },
  { top: '62%', left: '90%', size: 68, rotate: 15, delay: 2.5 },
  { top: '74%', left: '72%', size: 60, rotate: -5, delay: 1 },
  { top: '86%', left: '56%', size: 52, rotate: 18, delay: 0 },
  { top: '8%', left: '78%', size: 46, rotate: -12, delay: 1.2 },
  { top: '44%', left: '60%', size: 54, rotate: 10, delay: 2 },
];

export interface SubjectIconsProps {
  slug?: string;
}

export default function SubjectIcons({ slug }: SubjectIconsProps = {}) {
  const icons = (slug && ICON_SETS[slug]) || FALLBACK_ICONS;
  const positions: IconPos[] = POSITIONS.map((pos, i) => ({
    ...pos,
    Icon: icons[i % icons.length],
  }));

  return (
    <div className={styles.subjectIcons} aria-hidden="true">
      {positions.map(({ Icon, top, left, size, rotate, delay }, idx) => (
        <span
          key={idx}
          className={styles.subjectIcon}
          style={{
            top,
            left,
            width: size,
            height: size,
            transform: `rotate(${rotate}deg)`,
            animationDelay: `${delay}s`,
          }}
        >
          <Icon />
        </span>
      ))}
    </div>
  );
}
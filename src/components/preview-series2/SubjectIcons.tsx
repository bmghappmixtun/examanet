'use client';

import styles from './apex-series.module.css';

/**
 * Decorative background icons for the hero section.
 * Math symbols (∑, π, √, ∫, ∞, etc.) + tools (compass, ruler, calculator, book).
 * Renders as SVG with a subtle floating animation. Pointer-events disabled.
 */

interface IconProps {
  className?: string;
}

// Inline SVG components — small, lightweight, no JS dependency
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

const DivideIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="6" r="1.5" />
    <path d="M5 12h14M12 18l-2-4M12 18l2-4" />
    <circle cx="12" cy="18" r="1.5" />
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
    <path d="M21.3 8.7L8.7 21.3a2.41 2.41 0 0 1-3.4 0L2.7 18.7a2.41 2.41 0 0 1 0-3.4L15.3 2.7a2.41 2.41 0 0 1 3.4 0l2.6 2.6a2.41 2.41 0 0 1 0 3.4Z" />
    <path d="M7.5 10.5l2 2M10.5 7.5l3 3M13 6l2 2M7 13l-2 2M19 9l-2 2" />
  </svg>
);

const BookIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const CalculatorIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M8 6h8M8 10h2M14 10h2M8 14h2M14 14h2M8 18h2M14 18h2" />
  </svg>
);

const FunctionIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 11h6M9 15h6M14 7c0-1.1-.9-2-2-2s-2 .9-2 2M16 7c0-1.1-.9-2-2-2M14 17c0 1.1-.9 2-2 2s-2-.9-2-2M16 17c0 1.1-.9 2-2 2M12 21a9 9 0 1 1 0-14" />
  </svg>
);

const TriangleIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M13.73 4.07L21.16 17.59A2 2 0 0 1 19.43 21H4.57A2 2 0 0 1 2.84 17.59L10.27 4.07A2 2 0 0 1 13.73 4.07Z" />
  </svg>
);

const XIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// Position grid: each icon gets a position, size, rotation, and delay
const ICON_POSITIONS = [
  { Icon: SigmaIcon, top: '6%', left: '58%', size: 64, rotate: -15, delay: 0 },
  { Icon: PiIcon, top: '12%', left: '88%', size: 48, rotate: 12, delay: 1 },
  { Icon: SqrtIcon, top: '24%', left: '72%', size: 56, rotate: -8, delay: 2 },
  { Icon: CompassIcon, top: '38%', left: '94%', size: 72, rotate: 8, delay: 1.5 },
  { Icon: RulerIcon, top: '50%', left: '78%', size: 84, rotate: -20, delay: 0.5 },
  { Icon: BookIcon, top: '62%', left: '90%', size: 68, rotate: 15, delay: 2.5 },
  { Icon: InfinityIcon, top: '74%', left: '72%', size: 60, rotate: -5, delay: 1 },
  { Icon: IntegralIcon, top: '86%', left: '56%', size: 52, rotate: 18, delay: 0 },
  { Icon: CalculatorIcon, top: '8%', left: '78%', size: 46, rotate: -12, delay: 1.2 },
  { Icon: FunctionIcon, top: '44%', left: '60%', size: 54, rotate: 10, delay: 2 },
  { Icon: DivideIcon, top: '32%', left: '60%', size: 42, rotate: -18, delay: 0.8 },
  { Icon: TriangleIcon, top: '58%', left: '64%', size: 48, rotate: 22, delay: 1.8 },
  { Icon: XIcon, top: '80%', left: '82%', size: 36, rotate: -8, delay: 1.4 },
  { Icon: SigmaIcon, top: '20%', left: '64%', size: 42, rotate: 8, delay: 2.2 },
  { Icon: PiIcon, top: '70%', left: '56%', size: 56, rotate: -10, delay: 0.6 },
];

export default function SubjectIcons() {
  return (
    <div className={styles.subjectIcons} aria-hidden="true">
      {ICON_POSITIONS.map(({ Icon, top, left, size, rotate, delay }, idx) => (
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

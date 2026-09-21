'use client';

/**
 * Mega Menu Proposal #3 — "Side Drawer" (LEFT + monochrome)
 *
 * 2026-09-18 v2: User picked this variant with two changes:
 *   1. Drawer slides in from the LEFT (was right)
 *   2. Icons: monochrome grey/white, no colors, larger, modern
 *
 * Design notes:
 * - Full-height panel on the left, 380-420px wide
 * - Lucide icons at 20-22px (instead of emojis at 16-20px)
 * - Strict grey palette: slate-50 backgrounds, slate-700 text, no
 *   colored accents per cycle/section
 * - Subtle hover with bg-slate-100 only (no colored hovers)
 *
 * Trade-offs:
 *  ✓ Mobile-friendly (familiar pattern from native apps)
 *  ✓ Scales to many sections (vertical scroll)
 *  ✓ Very clean, professional look
 *  ✗ Less discoverable on desktop (single column)
 *  ✗ More clicks to reach a section
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import {
  X,
  ChevronRight,
  ChevronDown,
  // 2026-09-21: Removed cycle icons (Collège / Lycée) from drawer
  // per user request. Just kept Layers for the trigger button.
  Layers,
  // Section icons (kept — these ARE wanted next to each section row)
  Atom,
  Code2,
  BarChart3,
  Feather,
  Dumbbell,
  Sigma,
  FlaskConical,
  Wrench,
  Cpu,
  Briefcase,
} from 'lucide-react';
import { MEGA_MENU_DATA, type MegaMenuNiveau, type MegaMenuSection } from '@/lib/mega-menu-data';
import { BRUSH_BY_NIVEAU_SLUG, BRUSH_PUBLIC_PATH } from './brush-config';

/**
 * Pick the right localized label based on current locale.
 * Falls back to French if the locale is anything else (defensive).
 */
type Localized = { fr: string; ar: string };
function pickLabel(localized: Localized, locale: string): string {
  return locale === 'ar' ? localized.ar : localized.fr;
}

// ============== SECTION ICONS ==============
// 2026-09-21: Cycle icons (Collège/Lycée) were removed from drawer
// per user request — only section icons below remain.

const SECTION_ICONS: Record<string, typeof Atom> = {
  sciences: Atom,
  'technologies-informatique': Code2,
  'eco-services': BarChart3,
  lettres: Feather,
  sport: Dumbbell,
  maths: Sigma,
  'sciences-experimentales': FlaskConical,
  technique: Wrench,
  'sciences-informatique': Cpu,
  'eco-gestion': Briefcase,
};

// ============== PLURALIZATION HELPERS REMOVED 2026-09-21 ==============
// arSectionsCount / arNiveauxCount were used by the cycle header
// ("3 niveaux · 19 sections"). With cycle headers removed from the
// drawer, these helpers are no longer needed in this file. Kept here
// as comments for reference if cycle-level counts come back.
//
// function arSectionsCount(n: number): string {
//   if (n === 0) return '';
//   if (n === 1) return 'شعبة واحدة';
//   if (n === 2) return 'شعبتان';
//   if (n >= 3 && n <= 10) return `${n} شعب`;
//   return `${n} شعبة`;
// }
//
// function arNiveauxCount(n: number): string {
//   if (n === 0) return '0 مستوى';
//   if (n === 1) return 'مستوى واحد';
//   if (n === 2) return 'مستويان';
//   if (n >= 3 && n <= 10) return `${n} مستويات`;
//   return `${n} مستوى`;
// }

// ============== COMPONENT ==============

export default function MenuSideDrawer({
  triggerLabel,
  // 2026-09-21: Controlled mode so MobileMenu can drive the drawer.
  // When `open` is provided, the component is controlled — internal
  // state is skipped. `onOpenChange` is called when the user closes
  // the drawer (X, Escape, backdrop). When both are undefined we fall
  // back to fully uncontrolled behavior with an internal trigger.
  open: controlledOpen,
  onOpenChange,
  /**
   * When true, render the default trigger button ("Classes" /
   * "الأقسام" with Layers icon) at the natural anchor point.
   * When false, the drawer is controlled externally and the caller
   * decides how to open it (typical case: button in MobileMenu).
   * Default: true (preserves existing desktop usage).
   */
  showTrigger = true,
}: {
  triggerLabel?: { fr: string; ar: string };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
} = {}) {
  const locale = useLocale(); // 'fr' | 'ar' — drives label + RTL
  const isAr = locale === 'ar';
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setInternalOpen(next);
    }
  };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 2026-09-19: Track mount state so we can avoid SSR hydration issues
  // when rendering via Portal (the portal target doesn't exist on the
  // server). The trigger button itself is always rendered server-side.
  const [mounted, setMounted] = useState(false);

  // Default trigger text (localized based on current locale)
  const DEFAULT_TRIGGER: { fr: string; ar: string } = { fr: 'Classes', ar: 'الأقسام' };
  const trigger = triggerLabel ?? DEFAULT_TRIGGER;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 2026-09-20: Accordion behavior — opening one niveau closes any
  // other expanded niveau (across both cycles). User asked for this
  // because seeing both expanded at once was visually noisy.
  const toggle = (slug: string) => {
    setExpanded((prev) => {
      const next = new Set<string>();
      // If the clicked niveau was already open → close it (empty set).
      // Otherwise → open only this one, closing everything else.
      if (!prev.has(slug)) {
        next.add(slug);
      }
      return next;
    });
  };

  const CycleIcon = Layers;

  return (
    <>
      {/* 2026-09-21: Only render the default trigger when not in
          controlled mode (i.e. when the caller didn't pass `open`).
          When MobileMenu drives the drawer via props, the trigger
          lives there so it can match mobile nav item styling. */}
      {showTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-base text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition"
        >
          <CycleIcon className="w-5 h-5 text-slate-500" strokeWidth={1.75} />
          {/* 2026-09-19: trigger label now 'Classes' / 'الأقسام' by default
              (was 'Niveaux' / 'المستويات'). The drawer CONTENT still uses
              'Niveaux' internally (it lists the niveau rows). */}
          {isAr ? trigger.ar : trigger.fr}
        </button>
      )}

      {/* Drawer + backdrop rendered via Portal so they escape the
          Header's stacking context. The Header has backdrop-blur-xl
          which creates a containing block — a fixed-position child
          would otherwise be sized to the Header (73px tall) instead
          of the viewport (720px+). Rendering via Portal to
          document.body restores the expected full-viewport sizing. */}
      {open && mounted && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_200ms]"
            onClick={() => setOpen(false)}
          >
          <aside
            // 2026-09-18 v3: Drawer position depends on locale.
            //   - FR: slides in from the LEFT (slideInLeft)
            //   - AR: slides in from the RIGHT (slideInRight) — user pref
            //     to follow the natural reading direction in RTL.
            // The `dir` attribute inside the drawer mirrors the page locale
            // so Arabic text and icons flow RTL within the panel.
            dir={isAr ? 'rtl' : 'ltr'}
            className={[
              'absolute top-0 h-full w-[420px] max-w-[92vw] bg-white shadow-2xl',
              'overflow-y-auto flex flex-col',
              isAr
                ? 'right-0 animate-[slideInRight_300ms_ease-out]'
                : 'left-0 animate-[slideInLeft_300ms_ease-out]',
            ].join(' ')}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 2026-09-21: Top header now only has the close X button.
                The "Classes" title + icon box were removed per user
                request (see attached screenshot, red boxes).
                Visual identity comes from the brush-stroked niveau rows
                themselves (cool for collège, warm for lycée). */}
            <div className="sticky top-0 z-20 px-4 py-3 flex items-center justify-end bg-white/80 backdrop-blur-sm">
              <button
                onClick={() => setOpen(false)}
                className="min-w-[44px] min-h-[44px] p-2.5 hover:bg-slate-100 rounded-lg transition flex items-center justify-center"
                aria-label={isAr ? 'إغلاق' : 'Fermer'}
              >
                <X className="w-5 h-5 text-slate-500" strokeWidth={2} />
              </button>
            </div>

            {/* 2026-09-21: Niveau list — Collège + Lycée flattened into one
                scrollable list. The cycle headers (Collège/Lycée) and the
                "Échap pour fermer · © Examanet" footer were all removed
                per user request. Niveaux are visually distinguishable by
                their brush stroke color (cool palette for collège, warm
                for lycée). */}
            <div className="px-4 py-4 space-y-2 flex-1">
              {MEGA_MENU_DATA.flatMap((cycle) =>
                cycle.niveaux.map((n, nIdx) => (
                  <NiveauRow
                    key={n.slug}
                    niveau={n}
                    niveauIndex={nIdx}
                    cycleSlug={cycle.slug}
                    isExpanded={expanded.has(n.slug)}
                    onToggle={() => toggle(n.slug)}
                    onNavigate={() => setOpen(false)}
                    locale={locale}
                  />
                )),
              )}
            </div>
          </aside>
        </div>,
          document.body
        )
      }
    </>
  );
}

// ============== NIVEAU ROW ==============

function NiveauRow({
  niveau,
  niveauIndex,
  cycleSlug,
  isExpanded,
  onToggle,
  onNavigate,
  locale,
  showBrush = true,
}: {
  niveau: MegaMenuNiveau;
  niveauIndex: number;
  cycleSlug: 'college' | 'lycee';
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  locale: string;
  /**
   * 2026-09-19 v3: Show real watercolor PNG brush behind the label.
   * When true, the brush is rendered behind the label text and
   * scales to its width via the user's `width: calc(100% + 32px)`
   * spec. Default true (cleaner look, opt-out for monochrome).
   */
  showBrush?: boolean;
}) {
  const isAr = locale === 'ar';
  const brushColor = BRUSH_BY_NIVEAU_SLUG[niveau.slug];

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white">
      <div className="relative flex items-stretch">
        <Link
          href={niveau.url}
          onClick={onNavigate}
          className="group flex-1 flex items-center gap-3 px-4 py-4 hover:bg-slate-50 transition"
        >
          {/* 2026-09-19 v3: Real watercolor brush behind label.
              2026-09-20: Removed niveau icon + section count.
              2026-09-20 v2: User asked for "much bigger" text — bumped
              from text-sm (14px) to text-xl (20px) and increased
              vertical padding (py-3 → py-4) to keep proportions. */}
          <span className="class-label relative inline-flex items-center justify-center flex-1 font-bold text-xl text-slate-900">
            {showBrush && brushColor && (
              <img
                src={BRUSH_PUBLIC_PATH(brushColor)}
                alt=""
                aria-hidden="true"
                className="brush absolute left-1/2 top-1/2 w-[calc(100%+32px)] h-auto -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none select-none"
                draggable={false}
              />
            )}
            <span className="relative z-10">
              {pickLabel(niveau.label, locale)}
            </span>
          </span>
        </Link>
        {niveau.sections.length > 0 && (
          <button
            onClick={onToggle}
            className="min-w-[44px] hover:bg-slate-50 border-s border-slate-200 transition flex items-center justify-center"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? (isAr ? 'طي' : 'Replier') : (isAr ? 'بسط' : 'Déplier')}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-500" strokeWidth={2} />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" strokeWidth={2} />
            )}
          </button>
        )}
      </div>
      {isExpanded && niveau.sections.length > 0 && (
        <div className="relative bg-slate-50 border-t border-slate-200 px-3 py-3 space-y-1">
          {niveau.sections.map((s) => (
            <SectionRow key={s.slug} section={s} onNavigate={onNavigate} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============== SECTION ROW ==============

function SectionRow({
  section,
  onNavigate,
  locale,
}: {
  section: MegaMenuSection;
  onNavigate: () => void;
  locale: string;
}) {
  // 2026-09-20: User asked to KEEP the section icons (Atom, Code2, etc.)
  // — they were wrongly removed in the previous commit. Restored.
  const Icon = SECTION_ICONS[section.slug] ?? Atom;

  return (
    <Link
      href={section.url}
      onClick={onNavigate}
      // 2026-09-20 v2: Bumped section text from text-xs (12px) to
      // text-sm (14px) for the "much bigger text" request.
      className="flex items-center gap-3 py-3 px-3 rounded-md text-sm text-slate-700 hover:bg-white hover:text-slate-900 transition group"
    >
      <Icon
        className="w-5 h-5 text-slate-500 group-hover:text-slate-700 shrink-0"
        strokeWidth={1.5}
      />
      <span className="flex-1 truncate font-medium">{pickLabel(section.label, locale)}</span>
      <ChevronRight
        className="w-4 h-4 text-slate-400 group-hover:text-slate-700 shrink-0 rtl:rotate-180"
        strokeWidth={2}
      />
    </Link>
  );
}

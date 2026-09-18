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
import { Link } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import {
  X,
  ChevronRight,
  ChevronDown,
  Layers,
  // Cycle icons
  School,
  GraduationCap,
  // Niveau icons (moderne, monochrome)
  Hash,
  BookOpen,
  Library,
  BookText,
  BookMarked,
  Award,
  // Section icons
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
  ScrollText,
} from 'lucide-react';
import { MEGA_MENU_DATA, type MegaMenuNiveau, type MegaMenuSection } from '@/lib/mega-menu-data';

/**
 * Pick the right localized label based on current locale.
 * Falls back to French if the locale is anything else (defensive).
 */
type Localized = { fr: string; ar: string };
function pickLabel(localized: Localized, locale: string): string {
  return locale === 'ar' ? localized.ar : localized.fr;
}

// ============== ICON MAPPING (lucide, monochrome) ==============

const CYCLE_ICONS: Record<string, typeof School> = {
  college: School,
  lycee: GraduationCap,
};

const NIVEAU_ICONS: Record<string, typeof Hash> = {
  '7eme': Hash,
  '8eme': Hash,
  '9eme': Hash,
  '1ere-secondaire': BookOpen,
  '2eme-secondaire': BookText,
  '3eme-secondaire': BookMarked,
  '4eme-secondaire': Award,
};

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
  // 4AS lettres alias (same slug, same icon)
};

// ============== PLURALIZATION HELPERS (Arabic) ==============
//
// 2026-09-18: User clarified that "section" in Tunisian Arabic education
// terminology is:
//   - شعبة (singular, one section)
//   - شعب (plural, multiple sections)
//
// We also handle Arabic number agreement:
//   - 0 → "0 شعبة"
//   - 1 → "شعبة واحدة" (or just "شعبة")
//   - 2 → "شعبتان" (dual form)
//   - 3-10 → "X شعب" (plural with count)
//   - 11+ → "X شعبة" (singular noun with count, like French "11 sections")
//
// 2026-09-18 v2: User wants Latin digits (1, 2, 3) instead of
// Eastern Arabic numerals (٠١٢٣). The number AGREEMENT still follows
// Arabic rules (dual, plural), but the digits themselves stay ASCII.
//
// 2026-09-18 v2: User asked to NOT display the word "sections" at all
// in the Collège section of the menu (Collège has 0 sections by
// design — it's "tronc commun"). So when count === 0 we return '' and
// the caller omits the badge entirely.
function arSectionsCount(n: number): string {
  if (n === 0) return ''; // Collège has no sections — caller hides badge
  if (n === 1) return 'شعبة واحدة';
  if (n === 2) return 'شعبتان';
  if (n >= 3 && n <= 10) return `${n} شعب`;
  return `${n} شعبة`;
}

// Same rule for "niveau" in Arabic:
//   - 0 → "0 مستوى", 1 → "مستوى واحد", 2 → "مستويان", 3-10 → "X مستويات", 11+ → "X مستوى"
function arNiveauxCount(n: number): string {
  if (n === 0) return '0 مستوى';
  if (n === 1) return 'مستوى واحد';
  if (n === 2) return 'مستويان';
  if (n >= 3 && n <= 10) return `${n} مستويات`;
  return `${n} مستوى`;
}

// ============== COMPONENT ==============

export default function MenuSideDrawer() {
  const locale = useLocale(); // 'fr' | 'ar' — drives label + RTL
  const isAr = locale === 'ar';
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const toggle = (slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const CycleIcon = Layers;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-base text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition"
      >
        <CycleIcon className="w-5 h-5 text-slate-500" strokeWidth={1.75} />
        {isAr ? 'المستويات' : 'Niveaux'}
      </button>

      {open && (
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
            {/* Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 px-6 py-5 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <CycleIcon className="w-5 h-5 text-slate-700" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="font-extrabold text-lg text-slate-900">
                    {isAr ? 'المستويات' : 'Niveaux'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'البرنامج الرسمي التونسي' : 'Programme officiel tunisien'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
                aria-label={isAr ? 'إغلاق' : 'Fermer'}
              >
                <X className="w-5 h-5 text-slate-500" strokeWidth={2} />
              </button>
            </div>

            {/* Cycles & niveaux */}
            <div className="p-5 space-y-7 flex-1">
              {MEGA_MENU_DATA.map((cycle) => {
                const Icon = CYCLE_ICONS[cycle.slug] ?? School;
                const sectionsCount = cycle.niveaux.reduce(
                  (acc, n) => acc + n.sections.length,
                  0,
                );
                return (
                  <section key={cycle.slug}>
                    {/* Cycle header — monochrome */}
                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-slate-700" strokeWidth={1.5} />
                      </div>
                      <div>
                        <div className="font-extrabold text-base text-slate-900 tracking-wide">
                          {pickLabel(cycle.label, locale)}
                        </div>
                        {/* 2026-09-18 v2: only show the cycle subtitle when
                            there's something useful to say. For Collège
                            (0 sections), we skip the entire subtitle —
                            user asked to not show the word "sections"
                            when the count is zero. We always show the
                            "X niveaux" part because it's always useful. */}
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {(() => {
                            const niveauxPart = isAr
                              ? arNiveauxCount(cycle.niveaux.length)
                              : `${cycle.niveaux.length} niveaux`;
                            const sectionsPart = isAr
                              ? arSectionsCount(sectionsCount)
                              : `${sectionsCount} sections`;
                            // Collège (sections === 0) → only show niveaux
                            if (sectionsCount === 0) return niveauxPart;
                            return isAr
                              ? `${niveauxPart} · ${sectionsPart}`
                              : `${niveauxPart} · ${sectionsPart}`;
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Niveaux list */}
                    <div className="space-y-1.5">
                      {cycle.niveaux.map((n) => (
                        <NiveauRow
                          key={n.slug}
                          niveau={n}
                          isExpanded={expanded.has(n.slug)}
                          onToggle={() => toggle(n.slug)}
                          onNavigate={() => setOpen(false)}
                          locale={locale}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 px-6 py-3 text-center">
              <p className="text-[11px] text-slate-500">
                {isAr ? 'إسكيب للإغلاق · © إكسامانت' : 'Échap pour fermer · © Examanet'}
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ============== NIVEAU ROW ==============

function NiveauRow({
  niveau,
  isExpanded,
  onToggle,
  onNavigate,
  locale,
}: {
  niveau: MegaMenuNiveau;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  locale: string;
}) {
  const Icon = NIVEAU_ICONS[niveau.slug] ?? BookOpen;
  const isAr = locale === 'ar';

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
      <div className="flex items-stretch">
        <Link
          href={niveau.url}
          onClick={onNavigate}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition"
        >
          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-slate-600" strokeWidth={1.5} />
          </div>
          <span className="flex-1 font-semibold text-sm text-slate-800">
            {pickLabel(niveau.label, locale)}
          </span>
          {niveau.sections.length > 0 && (
            <span className="text-[10px] text-slate-400 tabular-nums">
              {isAr ? arSectionsCount(niveau.sections.length) : `${niveau.sections.length} sections`}
            </span>
          )}
        </Link>
        {niveau.sections.length > 0 && (
          <button
            onClick={onToggle}
            className="px-3 hover:bg-slate-50 border-s border-slate-200 transition"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Replier' : 'Déplier'}
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
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 space-y-0.5">
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
  const Icon = SECTION_ICONS[section.slug] ?? BookOpen;

  return (
    <Link
      href={section.url}
      onClick={onNavigate}
      className="flex items-center gap-2.5 py-2 px-2 rounded-md text-xs text-slate-700 hover:bg-white hover:text-slate-900 transition group"
    >
      <Icon
        className="w-4 h-4 text-slate-500 group-hover:text-slate-700 shrink-0"
        strokeWidth={1.5}
      />
      <span className="flex-1 truncate font-medium">{pickLabel(section.label, locale)}</span>
      <ChevronRight
        className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 shrink-0 rtl:rotate-180"
        strokeWidth={2}
      />
    </Link>
  );
}

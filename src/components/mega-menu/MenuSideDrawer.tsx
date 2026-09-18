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

// ============== COMPONENT ==============

export default function MenuSideDrawer() {
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
        Niveaux
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_200ms]"
          onClick={() => setOpen(false)}
        >
          <aside
            // LEFT drawer (was right-0)
            className="absolute top-0 left-0 h-full w-[420px] max-w-[92vw] bg-white shadow-2xl overflow-y-auto animate-[slideInLeft_300ms_ease-out] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 px-6 py-5 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                  <CycleIcon className="w-5 h-5 text-slate-700" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="font-extrabold text-lg text-slate-900">Niveaux</h2>
                  <p className="text-xs text-slate-500">Programme officiel tunisien</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
                aria-label="Fermer"
              >
                <X className="w-5 h-5 text-slate-500" strokeWidth={2} />
              </button>
            </div>

            {/* Cycles & niveaux */}
            <div className="p-5 space-y-7 flex-1">
              {MEGA_MENU_DATA.map((cycle) => {
                const Icon = CYCLE_ICONS[cycle.slug] ?? School;
                return (
                  <section key={cycle.slug}>
                    {/* Cycle header — monochrome */}
                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-slate-700" strokeWidth={1.5} />
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-slate-900 tracking-wide">
                          {cycle.label.fr}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {cycle.label.ar} · {cycle.niveaux.length} niveaux
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
                Échap pour fermer · © Examanet
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
}: {
  niveau: MegaMenuNiveau;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const Icon = NIVEAU_ICONS[niveau.slug] ?? BookOpen;

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
            {niveau.label.fr}
          </span>
          <span className="text-[10px] text-slate-400">
            {niveau.label.ar}
          </span>
        </Link>
        {niveau.sections.length > 0 && (
          <button
            onClick={onToggle}
            className="px-3 hover:bg-slate-50 border-l border-slate-200 transition"
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
            <SectionRow key={s.slug} section={s} onNavigate={onNavigate} />
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
}: {
  section: MegaMenuSection;
  onNavigate: () => void;
}) {
  const Icon = SECTION_ICONS[section.slug] ?? BookOpen;

  return (
    <Link
      href={section.url}
      onClick={onNavigate}
      className="flex items-center gap-2.5 py-2 px-2 rounded-md text-xs text-slate-700 hover:bg-white hover:text-slate-900 transition group"
    >
      <Icon className="w-4 h-4 text-slate-500 group-hover:text-slate-700 shrink-0" strokeWidth={1.5} />
      <span className="flex-1 truncate font-medium">{section.label.fr}</span>
      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 shrink-0" strokeWidth={2} />
    </Link>
  );
}

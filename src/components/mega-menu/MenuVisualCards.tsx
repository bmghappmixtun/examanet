'use client';

/**
 * Mega Menu Proposal #5 — "Visual Cards"
 *
 * Hover-to-open mega menu with large visual cards for each cycle
 * and section. Most visually rich option — designed to feel like a
 * premium learning platform (Coursera, Khan Academy style).
 *
 * Behaviour:
 * - Hover "Niveaux" → cards appear with stagger
 * - Click on a niveau card → expands to show sections
 * - Click on a section card → goes to filtered resources
 *
 * Trade-offs:
 *  ✓ Very visual, engaging, premium feel
 *  ✓ Each section has its own color/identity
 *  ✗ Takes more vertical space (~480px)
 *  ✗ More complex to maintain
 */

import { useState, useRef, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { MEGA_MENU_DATA, type MegaMenuNiveau, type MegaMenuCycle } from '@/lib/mega-menu-data';

const SECTION_THEMES: Record<string, { gradient: string; text: string; ring: string }> = {
  sciences: { gradient: 'from-sky-500 to-cyan-500', text: 'text-sky-700', ring: 'ring-sky-200' },
  'technologies-informatique': { gradient: 'from-blue-500 to-indigo-500', text: 'text-blue-700', ring: 'ring-blue-200' },
  'eco-services': { gradient: 'from-cyan-500 to-teal-500', text: 'text-cyan-700', ring: 'ring-cyan-200' },
  lettres: { gradient: 'from-purple-500 to-pink-500', text: 'text-purple-700', ring: 'ring-purple-200' },
  sport: { gradient: 'from-orange-500 to-red-500', text: 'text-orange-700', ring: 'ring-orange-200' },
  maths: { gradient: 'from-violet-500 to-purple-500', text: 'text-violet-700', ring: 'ring-violet-200' },
  'sciences-experimentales': { gradient: 'from-emerald-500 to-green-500', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  technique: { gradient: 'from-slate-500 to-zinc-500', text: 'text-slate-700', ring: 'ring-slate-200' },
  'sciences-informatique': { gradient: 'from-blue-600 to-indigo-600', text: 'text-blue-700', ring: 'ring-blue-200' },
  'eco-gestion': { gradient: 'from-red-500 to-rose-500', text: 'text-red-700', ring: 'ring-red-200' },
};

function getSectionTheme(slug: string) {
  return SECTION_THEMES[slug] ?? { gradient: 'from-slate-500 to-slate-600', text: 'text-slate-700', ring: 'ring-slate-200' };
}

export default function MenuVisualCards() {
  const [open, setOpen] = useState(false);
  const [expandedNiveau, setExpandedNiveau] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEnter = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setExpandedNiveau(null);
    }, 200);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setExpandedNiveau(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-4 py-2 rounded-lg font-semibold text-base text-slate-700 hover:text-primary-600 hover:bg-slate-50 transition"
      >
        <Sparkles className="w-4 h-4" />
        Niveaux
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 z-50 animate-[fadeIn_200ms]">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-[880px] max-w-[95vw] p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-extrabold text-lg text-slate-900">
                  Explorer les niveaux
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Programme officiel — du collège au baccalauréat
                </p>
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  setExpandedNiveau(null);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg lg:hidden"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-5">
              {MEGA_MENU_DATA.map((cycle) => (
                <CycleHeroColumn
                  key={cycle.slug}
                  cycle={cycle}
                  expandedNiveau={expandedNiveau}
                  setExpandedNiveau={setExpandedNiveau}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CycleHeroColumn({
  cycle,
  expandedNiveau,
  setExpandedNiveau,
}: {
  cycle: MegaMenuCycle;
  expandedNiveau: string | null;
  setExpandedNiveau: (slug: string | null) => void;
}) {
  const isEmerald = cycle.theme === 'emerald';

  return (
    <div>
      {/* Cycle header */}
      <div
        className={`flex items-center gap-3 mb-3 pb-3 border-b ${
          isEmerald ? 'border-emerald-200' : 'border-violet-200'
        }`}
      >
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-gradient-to-br shadow-sm ${
            isEmerald
              ? 'from-emerald-100 to-teal-100'
              : 'from-violet-100 to-purple-100'
          }`}
        >
          {cycle.emoji}
        </div>
        <div>
          <div
            className={`font-extrabold text-sm ${
              isEmerald ? 'text-emerald-700' : 'text-violet-700'
            }`}
          >
            {cycle.label.fr}
          </div>
          <div className="text-[11px] text-slate-500">
            {cycle.label.ar} · {cycle.niveaux.length} niveaux
          </div>
        </div>
      </div>

      {/* Niveaux cards */}
      <div className="space-y-2">
        {cycle.niveaux.map((n) => {
          const isExpanded = expandedNiveau === n.slug;
          return (
            <div key={n.slug}>
              <button
                onClick={() =>
                  setExpandedNiveau(isExpanded ? null : n.slug)
                }
                className={`w-full flex items-center gap-2 p-2.5 rounded-xl transition text-left ${
                  isExpanded
                    ? isEmerald
                      ? 'bg-emerald-50 ring-2 ring-emerald-200'
                      : 'bg-violet-50 ring-2 ring-violet-200'
                    : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <span className="text-lg">{n.emoji}</span>
                <span className="flex-1 font-bold text-sm text-slate-800">
                  {n.label.fr}
                </span>
                {n.sections.length > 0 && (
                  <span className="text-[10px] text-slate-500">
                    {n.sections.length} sections
                  </span>
                )}
              </button>
              {isExpanded && n.sections.length > 0 && (
                <div className="mt-2 ms-2 grid grid-cols-1 gap-1.5 animate-[fadeIn_200ms]">
                  {n.sections.map((s) => {
                    const theme = getSectionTheme(s.slug);
                    return (
                      <Link
                        key={s.slug}
                        href={s.url}
                        className={`group flex items-center gap-2 p-2 rounded-lg bg-white hover:shadow-md hover:ring-2 ${theme.ring} transition`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg bg-gradient-to-br ${theme.gradient} flex items-center justify-center text-base shrink-0`}
                        >
                          {s.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold text-xs ${theme.text} truncate`}>
                            {s.label.fr}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {s.desc?.fr}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

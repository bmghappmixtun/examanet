'use client';

/**
 * Mega Menu Proposal #4 — "Compact Bar"
 *
 * Hover-to-open horizontal bar (info-dense). Top tabs (Collège/Lycée)
 * then a horizontal scrollable list of niveaux + sections.
 *
 * Behaviour:
 * - Hover "Niveaux" → bar slides down
 * - Click on a cycle tab to switch
 * - Each niveau shows its sections inline as small badges
 *
 * Trade-offs:
 *  ✓ Compact (fits in 200px vertical space)
 *  ✓ Info-dense (all visible at once)
 *  ✓ Sections visible without extra clicks
 *  ✗ Can be overwhelming
 *  ✗ Less visual hierarchy
 *  ✗ Not mobile-friendly
 */

import { useState, useRef, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronDown, Layers } from 'lucide-react';
import { MEGA_MENU_DATA, type MegaMenuCycle } from '@/lib/mega-menu-data';

export default function MenuCompactBar() {
  const [open, setOpen] = useState(false);
  const [activeCycle, setActiveCycle] = useState<'college' | 'lycee'>('college');
  const closeTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEnter = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const cycle = MEGA_MENU_DATA.find((c) => c.slug === activeCycle)!;

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
        <Layers className="w-4 h-4" />
        Niveaux
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50 animate-[fadeIn_150ms]">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-[800px] max-w-[95vw]">
            {/* Cycle tabs (compact) */}
            <div className="flex gap-1 p-2 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
              {MEGA_MENU_DATA.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setActiveCycle(c.slug as 'college' | 'lycee')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition ${
                    activeCycle === c.slug
                      ? c.theme === 'emerald'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-violet-600 text-white'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <span>{c.emoji}</span>
                  {c.label.fr}
                </button>
              ))}
              <div className="ms-auto text-[10px] text-slate-500 self-center">
                {cycle.niveaux.length} niveaux · {cycle.niveaux.reduce((acc, n) => acc + n.sections.length, 0)} sections
              </div>
            </div>

            {/* Horizontal scroll of niveaux */}
            <div className="p-3 max-h-[280px] overflow-y-auto">
              <div className="space-y-2">
                {cycle.niveaux.map((n) => (
                  <CompactRow key={n.slug} niveau={n} cycle={cycle} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompactRow({ niveau, cycle }: { niveau: any; cycle: MegaMenuCycle }) {
  const accent = cycle.theme === 'emerald' ? 'text-emerald-700' : 'text-violet-700';
  const accentBg = cycle.theme === 'emerald' ? 'bg-emerald-100' : 'bg-violet-100';

  return (
    <div className="flex items-center gap-3 py-1.5">
      <Link
        href={niveau.url}
        className={`flex items-center gap-1.5 text-xs font-bold ${accent} hover:underline shrink-0`}
        style={{ minWidth: 130 }}
      >
        <span>{niveau.emoji}</span>
        <span className="truncate">{niveau.label.fr}</span>
      </Link>
      <div className="flex-1 flex flex-wrap gap-1">
        {niveau.sections.length === 0 ? (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${accentBg} ${accent}`}>
            tronc commun
          </span>
        ) : (
          niveau.sections.map((s: any) => (
            <Link
              key={s.slug}
              href={s.url}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
            >
              <span>{s.emoji}</span>
              {s.label.fr}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

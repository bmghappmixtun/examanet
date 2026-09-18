'use client';

/**
 * Mega Menu Proposal #1 — "Dropdown Panel"
 *
 * Hover-to-open mega menu. Panel drops below the header.
 * Two columns side-by-side (Collège | Lycée), each niveau shown with
 * its sections as chips underneath.
 *
 * Behaviour:
 * - Hover "Niveaux" → panel opens with 200ms fade
 * - Hover off the trigger + panel → panel closes with 150ms delay
 * - Click outside or Échap → close
 *
 * Trade-offs:
 *  ✓ Familiar, fast, low-friction
 *  ✗ Hover-based = bad on touch devices
 *  ✗ Limited vertical space (header height competes with panel)
 */

import { useState, useRef, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronDown, X } from 'lucide-react';
import { MEGA_MENU_DATA, type MegaMenuCycle, type MegaMenuNiveau } from '@/lib/mega-menu-data';

export default function MenuDropdownPanel() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEnter = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  // Close on Échap / click outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
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
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-4 py-2 rounded-lg font-semibold text-base text-slate-700 hover:text-primary-600 hover:bg-slate-50 transition"
      >
        Niveaux
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50 animate-[fadeIn_200ms_ease-out]">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[680px] p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Programme officiel tunisien</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-slate-100 rounded"
                aria-label="Fermer"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {MEGA_MENU_DATA.map((cycle) => (
                <CycleColumn key={cycle.slug} cycle={cycle} />
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 text-center">
              Cliquez sur un niveau ou une section pour filtrer les ressources
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CycleColumn({ cycle }: { cycle: MegaMenuCycle }) {
  const theme = cycle.theme === 'emerald'
    ? { bg: 'bg-emerald-50/60', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' }
    : { bg: 'bg-violet-50/60', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700' };

  return (
    <div>
      <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${theme.border}`}>
        <span className="text-2xl">{cycle.emoji}</span>
        <div>
          <div className={`font-extrabold text-sm ${theme.text}`}>{cycle.label.fr}</div>
          <div className="text-[10px] text-slate-500">{cycle.label.ar}</div>
        </div>
      </div>
      <div className="space-y-3">
        {cycle.niveaux.map((n) => (
          <NiveauBlock key={n.slug} niveau={n} badgeClass={theme.badge} />
        ))}
      </div>
    </div>
  );
}

function NiveauBlock({ niveau, badgeClass }: { niveau: MegaMenuNiveau; badgeClass: string }) {
  return (
    <div>
      <Link
        href={niveau.url}
        className="group flex items-center gap-2 hover:underline"
      >
        <span className="text-base">{niveau.emoji}</span>
        <span className="font-bold text-sm text-slate-800 group-hover:text-primary-700">
          {niveau.label.fr}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeClass}`}>
          {niveau.sections.length > 0 ? `${niveau.sections.length} sections` : 'tronc commun'}
        </span>
      </Link>
      {niveau.sections.length > 0 && (
        <div className="mt-1.5 ms-6 flex flex-wrap gap-1">
          {niveau.sections.map((s) => (
            <Link
              key={s.slug}
              href={s.url}
              className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 hover:bg-primary-100 hover:text-primary-700 transition"
            >
              {s.emoji} {s.label.fr}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

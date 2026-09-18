'use client';

/**
 * Mega Menu Proposal #2 — "Modal Overlay"
 *
 * Click-to-open modal centered on screen with backdrop blur.
 * Tabs at top: Collège / Lycée. Each tab shows niveaux as cards
 * with sections as sub-cards.
 *
 * Behaviour:
 * - Click "Niveaux" → modal opens with fade + scale
 * - Échap or click backdrop → close
 * - Tab switching animated
 *
 * Trade-offs:
 *  ✓ Touch-friendly (no hover needed)
 *  ✓ Very focused UX — great for discovering curriculum structure
 *  ✗ Disrupts flow (more clicks to navigate)
 *  ✗ Heavier visually
 */

import { useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronDown, X, ArrowRight, GraduationCap } from 'lucide-react';
import { MEGA_MENU_DATA, type MegaMenuNiveau, type MegaMenuCycle } from '@/lib/mega-menu-data';

export default function MenuModalOverlay() {
  const [open, setOpen] = useState(false);
  const [activeCycle, setActiveCycle] = useState<'college' | 'lycee'>('college');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const cycle = MEGA_MENU_DATA.find((c) => c.slug === activeCycle)!;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-4 py-2 rounded-lg font-semibold text-base text-slate-700 hover:text-primary-600 hover:bg-slate-50 transition"
      >
        <GraduationCap className="w-4 h-4" />
        Niveaux
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_200ms]"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-[scaleIn_250ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
              <div>
                <h2 className="font-extrabold text-xl text-slate-900">
                  Choisir un niveau
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Programme officiel tunisien — Ministère de l'Éducation
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
                aria-label="Fermer"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Cycle tabs */}
            <div className="px-6 pt-3 flex gap-2">
              {MEGA_MENU_DATA.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setActiveCycle(c.slug as 'college' | 'lycee')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition ${
                    activeCycle === c.slug
                      ? c.theme === 'emerald'
                        ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300'
                        : 'bg-violet-100 text-violet-700 ring-2 ring-violet-300'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-lg">{c.emoji}</span>
                  {c.label.fr}
                </button>
              ))}
            </div>

            {/* Niveaux grid */}
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cycle.niveaux.map((n) => (
                  <NiveauCard key={n.slug} niveau={n} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NiveauCard({ niveau }: { niveau: MegaMenuNiveau }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 hover:border-primary-300 transition">
      <Link
        href={niveau.url}
        className="flex items-center gap-3 group"
      >
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-xl shrink-0">
          {niveau.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 group-hover:text-primary-700 text-sm">
            {niveau.label.fr}
          </div>
          <div className="text-[11px] text-slate-500">{niveau.label.ar}</div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-primary-600 group-hover:translate-x-0.5 transition" />
      </Link>
      {niveau.sections.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 gap-1.5">
          {niveau.sections.map((s) => (
            <Link
              key={s.slug}
              href={s.url}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-slate-700 hover:bg-white hover:text-primary-700 hover:shadow-sm transition"
            >
              <span>{s.emoji}</span>
              <span className="flex-1 truncate">{s.label.fr}</span>
              <span className="text-[10px] text-slate-400 truncate max-w-[80px]">
                {s.desc?.fr}
              </span>
            </Link>
          ))}
        </div>
      )}
      {niveau.sections.length === 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200 text-[11px] text-slate-500">
          Tronc commun — toutes les matières
        </div>
      )}
    </div>
  );
}

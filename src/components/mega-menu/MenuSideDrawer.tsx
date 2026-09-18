'use client';

/**
 * Mega Menu Proposal #3 — "Side Drawer"
 *
 * Click-to-open slide-in drawer from the right. Vertical list with
 * collapsible sections. Mobile-first design.
 *
 * Behaviour:
 * - Click "Niveaux" → drawer slides in from right with backdrop
 * - Each niveau expandable to show sections
 * - Échap / backdrop / X → close
 *
 * Trade-offs:
 *  ✓ Mobile-friendly (familiar pattern from native apps)
 *  ✓ Scales to many sections (vertical scroll)
 *  ✗ Less discoverable on desktop (single column)
 *  ✗ More clicks to reach a section
 */

import { useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { X, ChevronRight, ChevronDown, GraduationCap } from 'lucide-react';
import { MEGA_MENU_DATA, type MegaMenuNiveau } from '@/lib/mega-menu-data';

export default function MenuSideDrawer() {
  const [open, setOpen] = useState(false);
  // Track which niveaux are expanded (default: first niveau of each cycle)
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-4 py-2 rounded-lg font-semibold text-base text-slate-700 hover:text-primary-600 hover:bg-slate-50 transition"
      >
        <GraduationCap className="w-4 h-4" />
        Niveaux
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_200ms]"
          onClick={() => setOpen(false)}
        >
          <aside
            className="absolute top-0 right-0 h-full w-[400px] max-w-[90vw] bg-white shadow-2xl overflow-y-auto animate-[slideInRight_300ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 px-5 py-4 flex items-center justify-between border-b border-slate-100">
              <div>
                <h2 className="font-extrabold text-lg text-slate-900">Niveaux</h2>
                <p className="text-xs text-slate-500">Programme officiel tunisien</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
                aria-label="Fermer"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Cycles & niveaux */}
            <div className="p-5 space-y-6">
              {MEGA_MENU_DATA.map((cycle) => (
                <section key={cycle.slug}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{cycle.emoji}</span>
                    <div>
                      <div className="font-extrabold text-sm text-slate-900">
                        {cycle.label.fr}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {cycle.label.ar} · {cycle.niveaux.length} niveaux
                      </div>
                    </div>
                  </div>
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
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

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
  return (
    <div className="rounded-lg overflow-hidden border border-slate-200">
      <div className="flex items-stretch">
        <Link
          href={niveau.url}
          onClick={onNavigate}
          className="flex-1 flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition"
        >
          <span className="text-lg">{niveau.emoji}</span>
          <span className="flex-1 font-semibold text-sm text-slate-800">
            {niveau.label.fr}
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
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )}
          </button>
        )}
      </div>
      {isExpanded && niveau.sections.length > 0 && (
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 space-y-1">
          {niveau.sections.map((s) => (
            <Link
              key={s.slug}
              href={s.url}
              onClick={onNavigate}
              className="flex items-center gap-2 py-1.5 text-xs text-slate-700 hover:text-primary-700"
            >
              <span>{s.emoji}</span>
              <span className="flex-1 truncate">{s.label.fr}</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

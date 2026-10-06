'use client';

/**
 * Mega Menu Proposal E — "Dropdown Cards" (2026-10-05)
 *
 * Vue initiale aérée : 28 grandes cartes colorées (1 par matière).
 * Au survol/clic d'une carte → 3 boutons apparaissent (Devoirs/Cours/Séries).
 *
 * Avantage : beaucoup moins de bruit visuel initial que la grille 84 liens.
 *
 * Comportement :
 * - Click "Matières" trigger → modal ouvre
 * - Hover ou click sur une carte → toggle l'affichage des 3 types
 * - Click backdrop/X/Esc → close
 * - Mobile : tap = toggle, pas de hover
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import {
  ChevronDown,
  X,
  BookOpen,
  FileText,
  Layers,
  ArrowRight,
  GraduationCap,
} from 'lucide-react';

interface SubjectItem {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string;
  color: string;
  order: number;
}

const TYPES = [
  { key: 'devoirs', label: 'Devoirs', icon: FileText, color: 'blue' as const, hover: 'hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700' },
  { key: 'cours', label: 'Cours', icon: BookOpen, color: 'amber' as const, hover: 'hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700' },
  { key: 'series', label: 'Séries', icon: Layers, color: 'emerald' as const, hover: 'hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700' },
];

export default function MenuMatieresDropdownCards() {
  const [open, setOpen] = useState(false);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  // Fetch subjects on first open (cached after)
  useEffect(() => {
    if (!open || subjects.length > 0) return;
    fetch('/api/matieres/list')
      .then((r) => (r.ok ? r.json() : { subjects: [] }))
      .then((d) => setSubjects(d.subjects || []))
      .catch(() => setSubjects([]));
  }, [open, subjects.length]);

  // Lock body scroll while open + Esc to close
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

  const visibleSubjects = subjects.filter((s) => !['pensee-islamique'].includes(s.slug));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-4 py-2 rounded-lg font-semibold text-base text-slate-700 hover:text-primary-600 hover:bg-slate-50 transition"
      >
        <BookOpen className="w-4 h-4" />
        Matières
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Explorer par matière"
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-auto animate-[scaleIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/90 hover:bg-white shadow-md transition"
            >
              <X className="w-5 h-5 text-slate-700" />
            </button>

            {/* Header */}
            <div className="sticky top-0 z-[5] bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-4">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-1">
                Explorer
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900">
                Toutes les matières
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Survole ou clique une carte pour voir Devoirs · Cours · Séries
              </p>
            </div>

            {/* Subjects grid */}
            <div className="p-4 md:p-6">
              {subjects.length === 0 ? (
                <div className="text-center py-12 text-slate-500">Chargement…</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {visibleSubjects.map((s) => {
                    const isHovered = hoveredSlug === s.slug;
                    return (
                      <SubjectCard
                        key={s.slug}
                        subject={s}
                        isHovered={isHovered}
                        onHover={() => setHoveredSlug(s.slug)}
                        onLeave={() => setHoveredSlug(null)}
                        onClick={() => setHoveredSlug(isHovered ? null : s.slug)}
                        onClose={() => setOpen(false)}
                      />
                    );
                  })}
                </div>
              )}

              {/* Footer: Bac archives */}
              <div className="mt-6 pt-5 border-t border-slate-200">
                <Link
                  href="/bac/archives"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 hover:shadow-lg transition group text-white"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-base">Examens Bac Tunisie</div>
                    <div className="text-xs text-white/70">Archives officielles 2010-2026</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/70 group-hover:translate-x-1 transition" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SubjectCard({
  subject,
  isHovered,
  onHover,
  onLeave,
  onClick,
  onClose,
}: {
  subject: SubjectItem;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
  onClose: () => void;
}) {
  const color = subject.color || '#0ea5e9';
  return (
    <div
      className="relative"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* CARD */}
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition ${
          isHovered
            ? 'border-slate-300 bg-white shadow-lg scale-105'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
        }`}
        aria-expanded={isHovered}
        aria-label={`${subject.nameFr} - voir les types`}
      >
        {/* Color circle with initial */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-2xl shadow-sm transition-transform"
          style={{
            backgroundColor: color,
            transform: isHovered ? 'scale(1.1) rotate(-3deg)' : 'scale(1)',
          }}
        >
          {subject.nameFr.charAt(0)}
        </div>
        <div className="font-bold text-sm text-slate-900 text-center leading-tight">
          {subject.nameFr}
        </div>
      </button>

      {/* TYPES POPUP (apparaît au hover/click) */}
      {isHovered && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 min-w-[200px] animate-[fadeIn_0.15s_ease-out]">
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 px-2 pb-1">
            {subject.nameFr}
          </div>
          {TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.key}
                href={`/preview-${t.key}2/${subject.slug}`}
                onClick={onClose}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 transition border-2 border-transparent ${t.hover}`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
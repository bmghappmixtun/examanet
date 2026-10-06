'use client';

/**
 * Mega Menu Proposal D — "Type-First Navigation" (2026-10-05)
 *
 * Inverse la logique : 3 gros onglets Devoirs/Cours/Séries en haut,
 * puis grille de matières filtrée par type.
 *
 * Avantage : 84 liens → 28 liens (1 par matière). Beaucoup plus épuré.
 *
 * Comportement :
 * - Click "Matières" trigger → modal ouvre (default = Devoirs)
 * - Tab switcher Devoirs/Cours/Séries
 * - Search bar en haut de la grille (filtre live)
 * - Grille de cards 4-5 colonnes
 * - Esc / X / backdrop → close
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from '@/i18n/navigation';
import {
  ChevronDown,
  X,
  BookOpen,
  Search,
  ArrowRight,
  FileText,
  Layers,
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

type TypeKey = 'devoirs' | 'cours' | 'series';

const TYPES: { key: TypeKey; label: string; icon: any; color: string; bg: string; border: string }[] = [
  { key: 'devoirs', label: 'Devoirs', icon: FileText, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-300' },
  { key: 'cours', label: 'Cours', icon: BookOpen, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300' },
  { key: 'series', label: 'Séries', icon: Layers, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-300' },
];

export default function MenuMatieresTypeFirst() {
  const [open, setOpen] = useState(false);
  const [activeType, setActiveType] = useState<TypeKey>('devoirs');
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [search, setSearch] = useState('');

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

  // Filtered subjects
  const filteredSubjects = useMemo(() => {
    const items = subjects.filter((s) => !['pensee-islamique'].includes(s.slug));
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (s) => s.nameFr.toLowerCase().includes(q) || s.nameAr.toLowerCase().includes(q),
    );
  }, [subjects, search]);

  const activeTypeMeta = TYPES.find((t) => t.key === activeType)!;
  const ActiveIcon = activeTypeMeta.icon;

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
            aria-label="Explorer par type puis par matière"
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-auto animate-[scaleIn_0.2s_ease-out]"
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

            {/* TYPE TABS (gros, en haut) */}
            <div className="sticky top-0 z-[5] bg-white/95 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-3">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">
                Que cherchez-vous ?
              </div>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => {
                  const Icon = t.icon;
                  const isActive = activeType === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActiveType(t.key)}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-base transition ${
                        isActive
                          ? `${t.bg} ${t.color} ${t.border} border-2 shadow-sm`
                          : 'bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CONTENT */}
            <div className="p-4 md:p-6">
              {/* Search bar */}
              <div className="relative mb-5">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Rechercher une matière de ${activeTypeMeta.label.toLowerCase()}...`}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-slate-300 focus:bg-white transition"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-200 transition"
                    aria-label="Effacer"
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                )}
              </div>

              {/* Results count */}
              <div className="flex items-center gap-2 mb-4 text-sm text-slate-600">
                <ActiveIcon className={`w-4 h-4 ${activeTypeMeta.color}`} />
                <span>
                  <strong className="text-slate-900">{filteredSubjects.length}</strong>{' '}
                  matière{filteredSubjects.length > 1 ? 's' : ''} avec {activeTypeMeta.label.toLowerCase()}
                </span>
              </div>

              {/* Subjects grid */}
              {subjects.length === 0 ? (
                <div className="text-center py-12 text-slate-500">Chargement…</div>
              ) : filteredSubjects.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  Aucune matière ne correspond à "{search}"
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {filteredSubjects.map((s) => (
                    <Link
                      key={s.slug}
                      href={`/preview-${activeType}2/${s.slug}`}
                      onClick={() => setOpen(false)}
                      className={`group flex items-center gap-2 p-3 rounded-xl border ${activeTypeMeta.border} ${activeTypeMeta.bg} hover:shadow-md transition`}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ backgroundColor: s.color || '#0ea5e9' }}
                      >
                        {s.nameFr.charAt(0)}
                      </div>
                      <span className={`font-bold text-sm ${activeTypeMeta.color} flex-1 truncate`}>
                        {s.nameFr}
                      </span>
                      <ArrowRight className={`w-4 h-4 ${activeTypeMeta.color} opacity-0 group-hover:opacity-100 transition`} />
                    </Link>
                  ))}
                </div>
              )}

              {/* Footer: Bac archives */}
              <div className="mt-6 pt-5 border-t border-slate-200">
                <Link
                  href="/bac/archives"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition group"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 text-sm">Examens Bac Tunisie</div>
                    <div className="text-xs text-slate-500">Archives officielles 2010-2026</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
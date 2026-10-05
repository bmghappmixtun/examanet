'use client';

/**
 * Mega Menu Proposal #6 — "Matières & Niveaux Modal" (NEW: 2026-09-29)
 *
 * Click-to-open modal with TWO tabs:
 *   1. "Par matière" — all subjects in 4-column grid (Devoirs/Séries/Cours each)
 *   2. "Par classe"  — all 7 classes (7ème → 4AS) with sections + filters
 *
 * Hero card adapts to active tab (green for matières, blue for classes).
 *
 * Behaviour:
 * - Click "Matières" trigger → modal opens with default "Par matière" tab
 * - Tab switcher at top to switch view
 * - Esc / X / backdrop → close
 * - Body scroll locked while open
 * - Mobile-friendly (responsive 4-col → 2-col grid)
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from '@/i18n/navigation';
import {
  ChevronDown,
  X,
  GraduationCap,
  BookOpen,
  Globe,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { MEGA_MENU_DATA } from '@/lib/mega-menu-data';

interface SubjectItem {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string;
  color: string;
  order: number;
}

type Tab = 'matieres' | 'classes';

export default function MenuMatieresModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('matieres');
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);

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

  // Split subjects into 4 columns
  const subjectColumns = useMemo(() => {
    const items = subjects.filter((s) => !['pensee-islamique'].includes(s.slug));
    const perCol = Math.ceil(items.length / 4);
    return [
      items.slice(0, perCol),
      items.slice(perCol, perCol * 2),
      items.slice(perCol * 2, perCol * 3),
      items.slice(perCol * 3),
    ];
  }, [subjects]);

  // Flatten all classes (Collège + Lycée) with their cycle info
  const allClasses = useMemo(() => {
    return MEGA_MENU_DATA.flatMap((cycle) =>
      cycle.niveaux.map((n) => ({ ...n, cycle: cycle.slug })),
    );
  }, []);

  // Split classes into 4 columns (4-2-1 or 2-2-2-1)
  const classColumns = useMemo(() => {
    const perCol = Math.ceil(allClasses.length / 4);
    return [
      allClasses.slice(0, perCol),
      allClasses.slice(perCol, perCol * 2),
      allClasses.slice(perCol * 2, perCol * 3),
      allClasses.slice(perCol * 3),
    ];
  }, [allClasses]);

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
            aria-label="Toutes les matières et niveaux"
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-auto animate-[scaleIn_0.2s_ease-out]"
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

            {/* TAB SWITCHER */}
            <div className="sticky top-0 z-[5] bg-white/95 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-2 flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-bold text-slate-500 mr-2 hidden sm:inline">
                Explorer par
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('matieres')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition ${
                  activeTab === 'matieres'
                    ? 'bg-gradient-to-r from-sky-500 to-orange-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                Matière
                <span className="text-xs opacity-70">({subjects.length || '…'})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('classes')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition ${
                  activeTab === 'classes'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                Classe
                <span className="text-xs opacity-70">({allClasses.length})</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
              {/* LEFT: Hero card (theme adapts to tab) */}
              {activeTab === 'matieres' ? (
                <MatiereHero subjectsCount={subjects.length} onClose={() => setOpen(false)} />
              ) : (
                <ClasseHero classesCount={allClasses.length} onClose={() => setOpen(false)} />
              )}

              {/* RIGHT: Content grid */}
              <div className="p-3 md:p-4">
                {activeTab === 'matieres' ? (
                  // ========== TAB: MATIÈRES ==========
                  <>
                    {subjects.length === 0 ? (
                      <div className="text-center py-12 text-slate-500">
                        Chargement des matières…
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
                        {subjectColumns.map((col, i) => (
                          <div key={i} className="space-y-2.5">
                            {col.map((s) => (
                              <SubjectColumn key={s.slug} subject={s} onClose={() => setOpen(false)} />
                            ))}
                            {i === 3 && (
                              <div className="pt-1">
                                <Link
                                  href="/bac/archives"
                                  onClick={() => setOpen(false)}
                                  className="block group"
                                >
                                  <div className="font-bold text-slate-900 group-hover:text-primary-600 transition mb-1 text-sm">
                                    Examens Bac Tunisie
                                  </div>
                                </Link>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  // ========== TAB: CLASSES ==========
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
                    {classColumns.map((col, i) => (
                      <div key={i} className="space-y-2.5">
                        {col.map((cl) => (
                          <ClassColumn key={cl.slug} classe={cl} onClose={() => setOpen(false)} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ====================== HERO CARDS ====================== */

function MatiereHero({
  subjectsCount,
  onClose,
}: {
  subjectsCount: number;
  onClose: () => void;
}) {
  return (
    <div className="relative bg-gradient-to-br from-sky-500 via-sky-500 to-orange-500 p-6 flex flex-col justify-between overflow-hidden">
      <div className="absolute top-8 right-6 opacity-20">
        <GraduationCap className="w-24 h-24 text-white" />
      </div>
      <div className="absolute bottom-12 left-4 opacity-15">
        <Globe className="w-20 h-20 text-white" />
      </div>
      <div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-10">
        <BookOpen className="w-32 h-32 text-white" />
      </div>

      <div className="relative z-10">
        <div className="text-sm uppercase tracking-widest text-white/90 font-bold mb-1.5">
          Toutes les
        </div>
        <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
          Matières
        </h2>
        <p className="text-white/95 text-base mt-3 max-w-[260px] leading-relaxed">
          Explorez {subjectsCount || 'toutes les'} matières du programme tunisien et accédez à leurs
          devoirs, séries et cours.
        </p>
      </div>

      <Link
        href="/matieres"
        onClick={onClose}
        className="relative z-10 inline-flex items-center gap-2 text-white text-base font-semibold hover:gap-3 transition-all mt-4"
      >
        Voir toutes les matières
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function ClasseHero({
  classesCount,
  onClose,
}: {
  classesCount: number;
  onClose: () => void;
}) {
  return (
    <div className="relative bg-gradient-to-br from-blue-700 via-blue-800 to-blue-950 p-6 flex flex-col justify-between overflow-hidden">
      <div className="absolute top-8 right-6 opacity-20">
        <Layers className="w-24 h-24 text-white" />
      </div>
      <div className="absolute bottom-12 left-4 opacity-15">
        <GraduationCap className="w-20 h-20 text-white" />
      </div>
      <div className="absolute top-1/2 right-8 -translate-y-1/2 opacity-10">
        <BookOpen className="w-32 h-32 text-white" />
      </div>

      <div className="relative z-10">
        <div className="text-sm uppercase tracking-widest text-blue-200 font-bold mb-1.5">
          Tous les
        </div>
        <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
          Niveaux
        </h2>
        <p className="text-blue-100 text-base mt-3 max-w-[260px] leading-relaxed">
          {classesCount} classes du système éducatif tunisien, avec leurs sections (maths, sciences, lettres, sport…).
        </p>
      </div>

      <Link
        href="/niveaux"
        onClick={onClose}
        className="relative z-10 inline-flex items-center gap-2 text-white text-base font-semibold hover:gap-3 transition-all mt-4"
      >
        Voir tous les niveaux
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

/* ====================== COLUMNS ====================== */

// 2026-09-29: Display-name overrides for the mega menu only.
// Students use abbreviations daily ("SVT" not "Sciences de la Vie et de la Terre"),
// so we show the friendly name in the menu. The DB stays canonical (full names).
const SUBJECT_DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'svt': 'SVT',
  'systeme-exploitation-reseaux': 'STI',
};

function getDisplayName(subject: SubjectItem): string {
  return SUBJECT_DISPLAY_NAME_OVERRIDES[subject.slug] ?? subject.nameFr;
}

function SubjectColumn({ subject, onClose }: { subject: SubjectItem; onClose: () => void }) {
  const base = `/matieres/${subject.slug}`;
  const displayName = getDisplayName(subject);
  return (
    <div>
      <Link
        href={base}
        onClick={onClose}
        className="block font-bold text-slate-900 hover:text-primary-600 transition mb-1.5 text-base"
      >
        {displayName}
      </Link>
      <div className="space-y-0.5 text-sm">
        <Link
          href={`/preview-devoirs2/${subject.slug}`}
          onClick={onClose}
          className="flex items-center gap-1 text-blue-700 hover:text-blue-900 transition font-semibold"
          title={`Devoirs ${displayName}`}
        >
          <span className="w-1 h-1 rounded-full bg-blue-500" />
          Devoirs
        </Link>
        <Link
          href={`/preview-cours2/${subject.slug}`}
          onClick={onClose}
          className="flex items-center gap-1 text-amber-700 hover:text-amber-900 transition font-semibold"
          title={`Cours ${displayName}`}
        >
          <span className="w-1 h-1 rounded-full bg-amber-500" />
          Cours
        </Link>
        <Link
          href={`/preview-series2/${subject.slug}`}
          onClick={onClose}
          className="flex items-center gap-1 text-green-700 hover:text-green-900 transition font-semibold"
          title={`Séries ${displayName}`}
        >
          <span className="w-1 h-1 rounded-full bg-green-500" />
          Séries
        </Link>
      </div>
    </div>
  );
}

function ClassColumn({
  classe,
  onClose,
}: {
  classe: any;
  onClose: () => void;
}) {
  const hasSections = classe.sections && classe.sections.length > 0;
  return (
    <div>
      <Link
        href={`/ressources?class=${classe.slug}`}
        onClick={onClose}
        className="block font-bold text-slate-900 hover:text-primary-600 transition mb-1.5 text-base"
      >
        {classe.label.fr}
      </Link>
      <div className="space-y-1 text-sm">
        <Link
          href={`/ressources?class=${classe.slug}&type=DEVOIR`}
          onClick={onClose}
          className="block text-slate-600 hover:text-primary-600 transition"
        >
          Devoirs {classe.label.fr}
        </Link>
        <Link
          href={`/ressources?class=${classe.slug}&type=EXERCISE`}
          onClick={onClose}
          className="block text-slate-600 hover:text-primary-600 transition"
        >
          Séries {classe.label.fr}
        </Link>
        <Link
          href={`/ressources?class=${classe.slug}&type=COURSE`}
          onClick={onClose}
          className="block text-slate-600 hover:text-primary-600 transition"
        >
          Cours {classe.label.fr}
        </Link>
        {hasSections && (
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
              Sections
            </div>
            {classe.sections.map((s: any) => (
              <Link
                key={s.slug}
                href={s.url}
                onClick={onClose}
                className="block text-slate-500 hover:text-primary-600 transition truncate"
              >
                {s.emoji} {s.label.fr}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

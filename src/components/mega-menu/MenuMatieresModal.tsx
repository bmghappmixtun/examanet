'use client';

/**
 * Mega Menu Proposal #6 — "Matières Modal" (NEW: 2026-09-29)
 *
 * Click-to-open modal showing ALL subjects (matières) with quick links to
 * Devoirs / Séries / Cours / Examens filtered by that subject.
 *
 * Layout (matches the attached mockup):
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ [Matière card]  │  Subjects grid (4 columns)           │
 *   │   image/        │  - Maths  - Physique - SVT - Info     │
 *   │   gradient      │  - Techno - Hist/Géo  - Anglais - Fr  │
 *   │                 │  - Écon/G - Philo     - PI    - Esp   │
 *   │                 │  - Arabe  - Allemand  - Italien - Bac │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Each subject shows 3 quick-filter links: Devoirs / Séries / Cours.
 * "Examens Bac Tunisie" card links to /bac/archives.
 *
 * Behaviour:
 * - Click "Matières" trigger button → modal opens with fade + scale
 * - Échap or click backdrop or click X → close
 * - Body scroll locked while open
 * - Touch-friendly
 *
 * Trade-offs vs other variants:
 *  ✓ Direct access to ALL subjects without navigation
 *  ✓ Single click to filter by subject + type
 *  ✓ Beautiful hero-style branding on the left
 *  ✗ Modal interrupts flow (like variant #2)
 *  ✗ Lots of links — needs visual hierarchy
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from '@/i18n/navigation';
import { ChevronDown, X, GraduationCap, BookOpen, Globe, ArrowRight } from 'lucide-react';

interface SubjectItem {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string;
  color: string;
  order: number;
}

export default function MenuMatieresModal() {
  const [open, setOpen] = useState(false);
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

  // Split subjects into 4 columns (for the 4-col grid)
  const columns = useMemo(() => {
    const items = subjects.filter((s) => !['pensee-islamique'].includes(s.slug));
    const perCol = Math.ceil(items.length / 4);
    return [
      items.slice(0, perCol),
      items.slice(perCol, perCol * 2),
      items.slice(perCol * 2, perCol * 3),
      items.slice(perCol * 3),
    ];
  }, [subjects]);

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
            aria-label="Toutes les matières"
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

            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
              {/* LEFT: Matière hero card */}
              <div className="relative bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-950 p-8 flex flex-col justify-between min-h-[260px] md:min-h-[480px] overflow-hidden">
                {/* Decorative icons */}
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
                  <div className="text-xs uppercase tracking-widest text-emerald-200 font-bold mb-2">
                    Toutes les
                  </div>
                  <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
                    Matières
                  </h2>
                  <p className="text-emerald-100 text-sm mt-3 max-w-[220px]">
                    Explorez {subjects.length || 'toutes les'} matières du programme tunisien et accédez à leurs devoirs, séries et cours.
                  </p>
                </div>

                <Link
                  href="/matieres"
                  onClick={() => setOpen(false)}
                  className="relative z-10 inline-flex items-center gap-2 text-white text-sm font-semibold hover:gap-3 transition-all mt-6"
                >
                  Voir toutes les matières
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* RIGHT: 4-column subjects grid */}
              <div className="p-6 md:p-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
                  {columns.map((col, i) => (
                    <div key={i} className="space-y-5">
                      {col.map((s) => (
                        <SubjectColumn key={s.slug} subject={s} onClose={() => setOpen(false)} />
                      ))}
                      {/* Examens Bac Tunisie card on last column */}
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

                {/* Empty state */}
                {subjects.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    Chargement des matières…
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

function SubjectColumn({ subject, onClose }: { subject: SubjectItem; onClose: () => void }) {
  const base = `/matieres/${subject.slug}`;
  return (
    <div>
      <Link
        href={base}
        onClick={onClose}
        className="block font-bold text-slate-900 hover:text-primary-600 transition mb-1 text-sm"
      >
        {subject.nameFr}
      </Link>
      <div className="space-y-0.5 text-xs">
        <Link
          href={`/ressources?subject=${subject.slug}&type=DEVOIR`}
          onClick={onClose}
          className="block text-slate-600 hover:text-primary-600 transition"
        >
          Devoirs {subject.nameFr}
        </Link>
        <Link
          href={`/ressources?subject=${subject.slug}&type=EXERCISE`}
          onClick={onClose}
          className="block text-slate-600 hover:text-primary-600 transition"
        >
          Séries {subject.nameFr}
        </Link>
        <Link
          href={`/ressources?subject=${subject.slug}&type=COURSE`}
          onClick={onClose}
          className="block text-slate-600 hover:text-primary-600 transition"
        >
          Cours {subject.nameFr}
        </Link>
      </div>
    </div>
  );
}

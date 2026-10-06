'use client';

/**
 * Mega Menu Proposition G — "Collège / Lycée" (2026-10-06)
 *
 * Structure basée sur le modèle #6 (Matières Modal) mais avec
 * tabs par CYCLE au lieu de par méthode d'exploration.
 *
 *   Collège (7-9ème) → tronc commun
 *   Lycée (1AS-4AS) → tronc commun + sections
 *
 * Subject classification (basée sur programme officiel tunisien) :
 * - COLLEGE_ONLY : histoire-geographie, education-islamique, education-civique,
 *                   education-artistique, education-musicale, theatre
 * - LYCEE_ONLY    : philosophie, economie, gestion, histoire, geographie,
 *                   algo-prog, bases-donnees, tic, systeme-exploitation-reseaux,
 *                   3eme-langue-allemand/italien/espagnol, genie-electrique
 * - BOTH          : arabe, francais, anglais, mathematiques, svt, physique,
 *                   informatique, technologie, pensee-islamique
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from '@/i18n/navigation';
import {
  ChevronDown,
  X,
  BookOpen,
  GraduationCap,
  School,
  ArrowRight,
  Languages,
} from 'lucide-react';

interface SubjectItem {
  id: string;
  slug: string;
  nameFr: string;
  nameAr: string;
  color: string;
  order: number;
}

type CycleKey = 'college' | 'lycee';

// Subject classification by cycle (slug → cycle or 'both')
// Source: programme officiel tunisien (Ministère Éducation 2026)
const SUBJECT_CYCLE: Record<string, 'college' | 'lycee' | 'both'> = {
  // Collège tronc commun (exclusif collège) + partagé
  'arabe': 'both',
  'francais': 'both',
  'anglais': 'both',
  'mathematiques': 'both',
  'svt': 'both',
  'physique': 'both',
  'histoire-geographie': 'college',
  'education-islamique': 'both',
  'pensee-islamique': 'both',
  'education-civique': 'both',
  'informatique': 'both',
  'technologie': 'both',

  // Collège only
  'education-artistique': 'college',
  'musique': 'college', // API slug musique = name "Musique" (collège)

  // Lycée only (philosophie introduite en 2AS+)
  'philosophie': 'lycee',
  'histoire': 'lycee',
  'geographie': 'lycee',
  'economie': 'lycee',
  'gestion': 'lycee',
  'algo-prog': 'lycee',
  'bases-donnees': 'lycee',
  'tic': 'lycee',
  'systeme-exploitation-reseaux': 'lycee',
  '3eme-langue-allemand': 'lycee',
  '3eme-langue-italien': 'lycee',
  '3eme-langue-espagnol': 'lycee',
  'genie-electrique': 'lycee',
  'theatre': 'lycee', // option artistique lycée
};

function classifySubject(slug: string): 'college' | 'lycee' | 'both' {
  return SUBJECT_CYCLE[slug] || 'both';
}

// Language of instruction for standard collège (JORT 2019-063).
// In Tunisia most collège subjects are taught in Arabic; only the language
// classes (Français/Anglais) are taught in their target language.
// 'fr' = small left block, 'ar' = large right block (per user request).
const SUBJECT_LANG_COLLEGE: Record<string, 'fr' | 'ar'> = {
  francais: 'fr',
  anglais: 'fr',
  // Everything else default = Arabic at standard collège.
  // (Physique, Informatique flipped for *pilote* — not applied here.)
};

function classifyLangCollege(slug: string): 'fr' | 'ar' {
  return SUBJECT_LANG_COLLEGE[slug] || 'ar';
}

export default function MenuMatieresCollegeLycee() {
  const [open, setOpen] = useState(false);
  const [activeCycle, setActiveCycle] = useState<CycleKey>('college');
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);

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

  // Filter subjects by cycle
  const visibleSubjects = useMemo(() => {
    const items = subjects.filter((s) => !['pensee-islamique'].includes(s.slug));
    return items.filter((s) => {
      const cycle = classifySubject(s.slug);
      return cycle === activeCycle || cycle === 'both';
    });
  }, [subjects, activeCycle]);

  // Split into 4 columns (Lycée) or 2 language halves (Collège)
  const subjectColumns = useMemo(() => {
    if (activeCycle === 'college') {
      const fr = visibleSubjects.filter((s) => classifyLangCollege(s.slug) === 'fr');
      const ar = visibleSubjects.filter((s) => classifyLangCollege(s.slug) === 'ar');
      return { fr, ar };
    }
    return null;
  }, [visibleSubjects, activeCycle]);

  // Lycée split into 4 columns
  const lyceeColumns = useMemo(() => {
    const perCol = Math.ceil(visibleSubjects.length / 4);
    return [
      visibleSubjects.slice(0, perCol),
      visibleSubjects.slice(perCol, perCol * 2),
      visibleSubjects.slice(perCol * 2, perCol * 3),
      visibleSubjects.slice(perCol * 3),
    ];
  }, [visibleSubjects]);

  const isCollege = activeCycle === 'college';

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
            aria-label="Matières par cycle"
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

            {/* CYCLE TABS */}
            <div className="sticky top-0 z-[5] bg-white/95 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-3">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">
                Quel cycle ?
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveCycle('college')}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl font-bold text-base transition ${
                    isCollege
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md border-2 border-emerald-300'
                      : 'bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100'
                  }`}
                >
                  <School className="w-6 h-6" />
                  <div className="text-left">
                    <div className="text-base">Collège</div>
                    <div className="text-xs opacity-80 font-normal">7ème → 9ème année</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCycle('lycee')}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl font-bold text-base transition ${
                    !isCollege
                      ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-md border-2 border-violet-300'
                      : 'bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100'
                  }`}
                >
                  <GraduationCap className="w-6 h-6" />
                  <div className="text-left">
                    <div className="text-base">Lycée</div>
                    <div className="text-xs opacity-80 font-normal">1ère → 4ème année (Bac)</div>
                  </div>
                </button>
              </div>
            </div>

            {/* CONTENT GRID + HERO */}
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
              {/* LEFT: Hero card */}
              <CycleHero cycle={activeCycle} subjectsCount={visibleSubjects.length} onClose={() => setOpen(false)} />

              {/* RIGHT: Content grid */}
              <div className="p-3 md:p-4">
                {subjects.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    Chargement des matières…
                  </div>
                ) : isCollege && subjectColumns ? (
                  /* COLLÈGE: 2 moitiés FR (gauche) / AR (droite) */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* LEFT — Enseignées en français */}
                    <LangHalf
                      lang="fr"
                      title="Enseignées en français"
                      subtitle="Matières où la langue d'enseignement est le français"
                      badge="FR"
                      subjects={subjectColumns.fr}
                      onClose={() => setOpen(false)}
                    />
                    {/* RIGHT — Enseignées en arabe */}
                    <LangHalf
                      lang="ar"
                      title="تُدرَّس بالعربية"
                      subtitle="Matières où la langue d'enseignement est l'arabe"
                      badge="ع"
                      subjects={subjectColumns.ar}
                      onClose={() => setOpen(false)}
                    />
                  </div>
                ) : (
                  /* LYCÉE: grille 4 colonnes (modèle actuel) */
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
                    {lyceeColumns.map((col, i) => (
                      <div key={i} className="space-y-2.5">
                        {col.map((s) => (
                          <SubjectColumn
                            key={s.slug}
                            subject={s}
                            onClose={() => setOpen(false)}
                            cycle={activeCycle}
                          />
                        ))}
                        {i === 3 && activeCycle === 'lycee' && (
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
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ====================== HERO CARD ====================== */

function CycleHero({
  cycle,
  subjectsCount,
  onClose,
}: {
  cycle: CycleKey;
  subjectsCount: number;
  onClose: () => void;
}) {
  if (cycle === 'college') {
    return (
      <div className="relative bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-6 flex flex-col justify-between overflow-hidden">
        <div className="absolute top-8 right-6 opacity-20">
          <School className="w-24 h-24 text-white" />
        </div>
        <div className="absolute bottom-12 left-4 opacity-15">
          <BookOpen className="w-20 h-20 text-white" />
        </div>
        <div className="relative z-10">
          <div className="text-sm uppercase tracking-widest text-white/90 font-bold mb-1.5">
            Cycle
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
            Collège
          </h2>
          <p className="text-white/95 text-base mt-3 max-w-[260px] leading-relaxed">
            Enseignement de base (7ème → 9ème). Tronc commun pour toutes les matières.
          </p>
        </div>
        <div className="relative z-10 mt-4 flex items-center gap-2 text-white">
          <span className="text-2xl font-bold">{subjectsCount}</span>
          <span className="text-white/90 text-sm">matières disponibles</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 flex flex-col justify-between overflow-hidden">
      <div className="absolute top-8 right-6 opacity-20">
        <GraduationCap className="w-24 h-24 text-white" />
      </div>
      <div className="absolute bottom-12 left-4 opacity-15">
        <BookOpen className="w-20 h-20 text-white" />
      </div>
      <div className="relative z-10">
        <div className="text-sm uppercase tracking-widest text-white/90 font-bold mb-1.5">
          Cycle
        </div>
        <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
          Lycée
        </h2>
        <p className="text-white/95 text-base mt-3 max-w-[260px] leading-relaxed">
          Enseignement secondaire (1ère → 4ème année). Tronc commun + 7 sections du Bac.
        </p>
      </div>
      <div className="relative z-10 mt-4 flex items-center gap-2 text-white">
        <span className="text-2xl font-bold">{subjectsCount}</span>
        <span className="text-white/90 text-sm">matières disponibles</span>
      </div>
    </div>
  );
}

/* ====================== SUBJECT COLUMN ====================== */

// Short labels for each subject (so links stay compact: "Devoirs Math" not
// "Devoirs Mathématiques"). Falls back to full nameFr if no short label.
const SHORT_LABELS: Record<string, string> = {
  mathematiques: 'Math',
  physique: 'Physique',
  svt: 'SVT',
  francais: 'Français',
  anglais: 'Anglais',
  arabe: 'Arabe',
  histoire: 'Histoire',
  geographie: 'Géographie',
  histoire_geographie: 'Histoire-Géo',
  'histoire-geographie': 'Histoire-Géo',
  philosophie: 'Philo',
  economie: 'Économie',
  gestion: 'Gestion',
  informatique: 'Info',
  technologie: 'Techno',
  'algo-prog': 'Algo',
  'bases-donnees': 'BD',
  tic: 'TIC',
  'systeme-exploitation-reseaux': 'SE',
  '3eme-langue-allemand': 'Allemand',
  '3eme-langue-italien': 'Italien',
  '3eme-langue-espagnol': 'Espagnol',
  'education-islamique': 'Islamique',
  'pensee-islamique': 'Pensée Isl.',
  'education-civique': 'Civique',
  'education-artistique': 'Artistique',
  musique: 'Musique',
  theatre: 'Théâtre',
  'genie-electrique': 'Génie Élec.',
};

function getShortLabel(slug: string, fullName: string): string {
  return SHORT_LABELS[slug] || fullName;
}

function SubjectColumn({
  subject,
  onClose,
  cycle,
  lang,
}: {
  subject: SubjectItem;
  onClose: () => void;
  cycle: CycleKey;
  lang?: 'fr' | 'ar';
}) {
  const short = getShortLabel(subject.slug, subject.nameFr);
  const linkBase = 'block text-slate-500 hover:text-slate-900 transition text-xs leading-tight py-0.5';
  const displayName = lang === 'ar' && subject.nameAr ? subject.nameAr : subject.nameFr;
  return (
    <div className="mb-1">
      <Link
        href={`/matieres/${subject.slug}`}
        onClick={onClose}
        className="block group"
      >
        <div
          className={`font-bold text-slate-900 group-hover:text-primary-600 transition mb-1 text-sm ${
            lang === 'ar' ? 'text-right' : ''
          }`}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          {displayName}
        </div>
      </Link>
      <div className="flex flex-col text-sm" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Link
          href={`/preview-devoirs2/${subject.slug}`}
          onClick={onClose}
          className={linkBase}
          title={`Devoirs ${displayName}`}
        >
          Devoirs {short}
        </Link>
        <Link
          href={`/preview-series2/${subject.slug}`}
          onClick={onClose}
          className={linkBase}
          title={`Séries ${displayName}`}
        >
          Séries {short}
        </Link>
        <Link
          href={`/preview-cours2/${subject.slug}`}
          onClick={onClose}
          className={linkBase}
          title={`Cours ${displayName}`}
        >
          Cours {short}
        </Link>
      </div>
    </div>
  );
}

/* ====================== LANGUAGE HALF (Collège) ====================== */

function LangHalf({
  lang,
  title,
  subtitle,
  badge,
  subjects,
  onClose,
}: {
  lang: 'fr' | 'ar';
  title: string;
  subtitle: string;
  badge: string;
  subjects: SubjectItem[];
  onClose: () => void;
}) {
  const isRtl = lang === 'ar';
  const accent =
    lang === 'fr'
      ? 'border-blue-200 bg-blue-50/40'
      : 'border-emerald-200 bg-emerald-50/40';
  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`rounded-xl border ${accent} p-3`}
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200/60">
        <span
          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-extrabold ${
            lang === 'fr'
              ? 'bg-blue-600 text-white'
              : 'bg-emerald-600 text-white'
          }`}
        >
          {badge}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`font-bold text-sm text-slate-900 ${isRtl ? 'text-right' : ''}`}>
            {title}
          </div>
          <div className={`text-[11px] text-slate-500 ${isRtl ? 'text-right' : ''}`}>
            {subtitle}
          </div>
        </div>
        <Languages className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </div>
      <div className={`grid gap-x-3 gap-y-2 ${subjects.length > 4 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {subjects.map((s) => (
          <SubjectColumn
            key={s.slug}
            subject={s}
            onClose={onClose}
            cycle="college"
            lang={lang}
          />
        ))}
      </div>
    </div>
  );
}
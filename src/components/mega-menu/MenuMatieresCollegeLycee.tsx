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
  GraduationCap,
  School,
  ArrowRight,
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

// Language of instruction for standard collège (JORT 2019-063 + user
// override: Informatique is taught in French at collège, even in standard
// curriculum — confirmed by the user 2026-10-06).
// 'fr' = small left block, 'ar' = large right block (per user request).
const SUBJECT_LANG_COLLEGE: Record<string, 'fr' | 'ar'> = {
  francais: 'fr',
  anglais: 'fr',
  informatique: 'fr', // User: 'informatique est en français pour le collège'
  // Everything else default = Arabic at standard collège.
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
        <School className="w-4 h-4" />
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

            {/* CYCLE TABS — gray/black/white only */}
            <div className="sticky top-0 z-[5] bg-white/95 backdrop-blur border-b border-slate-200 px-4 md:px-6 py-3">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">
                Quel cycle ?
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveCycle('college')}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl font-bold transition ${
                    isCollege
                      ? 'bg-slate-900 text-white shadow-md border-2 border-slate-900'
                      : 'bg-slate-100 text-slate-700 border-2 border-transparent hover:bg-slate-200'
                  }`}
                >
                  <School className="w-6 h-6" />
                  <div className="text-left">
                    <div className="text-lg">Collège</div>
                    <div className="text-xs opacity-80 font-normal">7ème → 9ème année</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCycle('lycee')}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl font-bold transition ${
                    !isCollege
                      ? 'bg-slate-900 text-white shadow-md border-2 border-slate-900'
                      : 'bg-slate-100 text-slate-700 border-2 border-transparent hover:bg-slate-200'
                  }`}
                >
                  <GraduationCap className="w-6 h-6" />
                  <div className="text-left">
                    <div className="text-lg">Lycée</div>
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
                  /* COLLÈGE: 1/3 FR (gauche) + 2/3 AR (droite) — pas de titre */
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* LEFT (1/3) — Enseignées en français */}
                    <div className="md:col-span-1">
                      <LangHalf
                        lang="fr"
                        subjects={subjectColumns.fr}
                        onClose={() => setOpen(false)}
                        cycle={activeCycle}
                      />
                    </div>
                    {/* RIGHT (2/3) — Enseignées en arabe */}
                    <div className="md:col-span-2">
                      <LangHalf
                        lang="ar"
                        subjects={subjectColumns.ar}
                        onClose={() => setOpen(false)}
                        cycle={activeCycle}
                      />
                    </div>
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
  // No colors, no images, no gradients — just text on a neutral panel.
  // User request (2026-10-06): gray/black/white only.
  const label = cycle === 'college' ? 'Collège' : 'Lycée';
  const desc =
    cycle === 'college'
      ? 'Enseignement de base (7ème → 9ème). Tronc commun pour toutes les matières.'
      : 'Enseignement secondaire (1ère → 4ème année). Tronc commun + 7 sections du Bac.';
  return (
    <div className="bg-slate-50 border-r border-slate-200 p-6 flex flex-col justify-between min-h-full">
      <div>
        <div className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">
          Cycle
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight">
          {label}
        </h2>
        <p className="text-slate-700 text-sm mt-3 leading-relaxed">
          {desc}
        </p>
      </div>
      <div className="mt-6 flex items-baseline gap-2 text-slate-900">
        <span className="text-3xl font-extrabold">{subjectsCount}</span>
        <span className="text-slate-500 text-sm">matières disponibles</span>
      </div>
    </div>
  );
}

/* ====================== SUBJECT COLUMN ====================== */

// Cycle-specific display name overrides (2026-10-06).
// User: 'au lycée la technologie ne s'appelle pas technologie, autre chose'.
// At lycée (3AS/4AS Bac Technique) the subject is officially
// "Technologie industrielle" (Génie mécanique + Génie électrique).
const SUBJECT_CYCLE_DISPLAY_NAME: Record<string, { college?: string; lycee?: string }> = {
  technologie: {
    college: 'Technologie',
    lycee: 'Technologie industrielle',
  },
};

function getShortLabel(slug: string, lang: 'fr' | 'ar', fallback: string): string {
  if (lang === 'ar') {
    return SHORT_LABELS_AR[slug] || fallback;
  }
  return SHORT_LABELS_FR[slug] || fallback;
}

function getDisplayNameForCycle(subject: SubjectItem, cycle: CycleKey): string {
  const override = SUBJECT_CYCLE_DISPLAY_NAME[subject.slug]?.[cycle];
  return override ?? subject.nameFr;
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
  const isAr = lang === 'ar';
  const labels = isAr ? LINK_LABELS.ar : LINK_LABELS.fr;
  const displayNameFr = getDisplayNameForCycle(subject, cycle);
  const short = getShortLabel(subject.slug, isAr ? 'ar' : 'fr', isAr ? subject.nameAr || displayNameFr : displayNameFr);
  // No colors — gray text on hover only.
  // Make links BIG: large text + generous padding + full-width block.
  const titleCls = isAr
    ? 'font-bold text-slate-900 hover:text-black transition mb-1 text-base leading-snug'
    : 'font-bold text-slate-900 hover:text-black transition mb-1 text-base leading-snug';
  const linkCls = isAr
    ? 'block text-slate-700 hover:text-black hover:underline transition text-sm leading-snug py-1.5 px-1 -mx-1 rounded'
    : 'block text-slate-700 hover:text-black hover:underline transition text-sm leading-snug py-1.5 px-1 -mx-1 rounded';
  // Display name: AR = nameAr ; FR = cycle-specific (Technologie industrielle for lycée)
  const displayName = isAr && subject.nameAr ? subject.nameAr : displayNameFr;
  // Cycle param so the target page filters by cycle's classes
  const cycleQs = `?cycle=${cycle}`;
  return (
    <div className="mb-2">
      <Link
        href={`/matieres/${subject.slug}`}
        onClick={onClose}
        className="block group"
      >
        <div
          className={`${titleCls} ${isAr ? 'text-right' : ''}`}
          dir={isAr ? 'rtl' : 'ltr'}
        >
          {displayName}
        </div>
      </Link>
      <div className="flex flex-col" dir={isAr ? 'rtl' : 'ltr'}>
        <Link
          href={`/preview-devoirs2/${subject.slug}${cycleQs}`}
          onClick={onClose}
          className={linkCls}
          title={`${labels.devoirs} ${displayName}`}
        >
          {labels.devoirs} {short}
        </Link>
        <Link
          href={`/preview-series2/${subject.slug}${cycleQs}`}
          onClick={onClose}
          className={linkCls}
          title={`${labels.series} ${displayName}`}
        >
          {labels.series} {short}
        </Link>
        <Link
          href={`/preview-cours2/${subject.slug}${cycleQs}`}
          onClick={onClose}
          className={linkCls}
          title={`${labels.cours} ${displayName}`}
        >
          {labels.cours} {short}
        </Link>
      </div>
    </div>
  );
}

/* ====================== LANGUAGE HALF (Collège) ====================== */

// French and Arabic vocab for the 3 link types.
// Arabic side uses Tunisian school terminology:
//   فروض (furuḍ)     = devoirs/épreuves (user override 2026-10-06)
//   تمارين (tamārīn) = exercices/séries
//   دروس (durūs)     = cours/leçons
const LINK_LABELS: Record<'fr' | 'ar', { devoirs: string; series: string; cours: string }> = {
  fr: { devoirs: 'Devoirs', series: 'Séries', cours: 'Cours' },
  ar: { devoirs: 'فروض', series: 'تمارين', cours: 'دروس' },
};

// Short labels per subject AND per language side (so 'Math' on FR side,
// 'الرياضيات' on AR side, etc.).
const SHORT_LABELS_FR: Record<string, string> = {
  mathematiques: 'Math',
  physique: 'Physique',
  svt: 'SVT',
  francais: 'Français',
  anglais: 'Anglais',
  arabe: 'Arabe',
  histoire: 'Histoire',
  geographie: 'Géographie',
  'histoire-geographie': 'Histoire-Géo',
  philosophie: 'Philo',
  economie: 'Économie',
  gestion: 'Gestion',
  informatique: 'Info',
  technologie: 'Techno',
  'algo-prog': 'Algo',
  'bases-donnees': 'BD',
  tic: 'TIC',
  'systeme-exploitation-reseaux': 'STI',
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

// Short labels in Arabic — used on the AR side. Falls back to nameAr.
// We intentionally omit Informatique here since it lives in the FR side at collège.
const SHORT_LABELS_AR: Record<string, string> = {
  mathematiques: 'الرياضيات',
  physique: 'الفيزياء',
  svt: 'علوم الحياة والأرض',
  francais: 'الفرنسية',
  anglais: 'الإنجليزية',
  arabe: 'دراسة النص',
  histoire: 'التاريخ',
  geographie: 'الجغرافيا',
  'histoire-geographie': 'التاريخ والجغرافيا',
  philosophie: 'الفلسفة',
  economie: 'الاقتصاد',
  gestion: 'التصرف',
  informatique: 'الإعلامية',
  technologie: 'التكنولوجيا',
  'algo-prog': 'الخوارزميات',
  'bases-donnees': 'قواعد البيانات',
  tic: 'تكنولوجيا المعلومات',
  'systeme-exploitation-reseaux': 'أنظمة التشغيل',
  'education-islamique': 'التربية الإسلامية',
  'education-civique': 'التربية المدنية',
  'education-artistique': 'التربية التشكيلية',
  musique: 'الموسيقى',
  theatre: 'المسرحية',
};

function LangHalf({
  lang,
  subjects,
  onClose,
  cycle,
}: {
  lang: 'fr' | 'ar';
  subjects: SubjectItem[];
  onClose: () => void;
  cycle: CycleKey;
}) {
  const isRtl = lang === 'ar';
  // No colors — just gray borders.
  const border = 'border-slate-200';
  // AR side gets wider 2-col grid (since the parent gave it 2/3 width)
  // + FR side stays 1-col (parent gave it 1/3 width)
  const gridCols = isRtl ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`border ${border} p-3`}
    >
      <div className={`grid gap-x-3 gap-y-2 ${gridCols}`}>
        {subjects.map((s) => (
          <SubjectColumn
            key={s.slug}
            subject={s}
            onClose={onClose}
            cycle={cycle}
            lang={lang}
          />
        ))}
      </div>
    </div>
  );
}
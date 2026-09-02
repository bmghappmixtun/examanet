// 2026-08-12: Extended parser to handle 2 formats:
//   1. "Exercice N (Type): summary" — for séries/devoirs (Physique, Chimie, Math, SVT)
//   2. "Titre: summary" — for cours (numbered automatically, no type badge)
//
// 2026-08-10: New component - displays AI-extracted exercise summaries
// (from ResourceMetadata.keyInsights) as a separate collapsible card
// between the AI Summary and the "Points clés" card.

import {
  ListChecks,
  FlaskConical,
  Atom,
  BookOpen,
  Wrench,
  Cog,
  Zap,
  FileText,
} from 'lucide-react';
import AiContentSection from './AiContentSection';

interface AiExerciseOverviewProps {
  /** Array of strings like:
   *  - "Exercice 1 (Physique): ..." or "Exercice 2 (Math): ..." (séries/devoirs)
   *  - "Introduction: La statistique décrit..." (cours, titre + résumé) */
  keyInsights: string[];
  /** Optional subject slug for palette selection. */
  subjectSlug?: string | null;
  /** Resource type — used to switch the title and badge. */
  resourceType?: 'COURSE' | 'EXERCISE' | 'DEVOIR' | 'SUMMARY' | 'OTHER' | null;
  /** Optional metadata chips to display above the list (e.g. "Dossier technique",
   *  system name, specialty). For Technologie, replaces the default "N exercices math" chip. */
  meta?: Array<{
    label: string;
    /** Lucide icon name. Optional. */
    icon?: 'wrench' | 'cog' | 'zap' | 'book' | 'file' | 'flask' | 'atom';
    /** Color theme. Default is "indigo". */
    color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate';
  }> | null;
}

type KeyInsightType = 'Physique' | 'Chimie' | 'Math' | 'SVT' | 'Anglais' | 'Français' | 'Arabe' | 'Philosophie' | 'Histoire' | 'Géographie' | 'Économie' | 'Gestion' | 'Informatique' | 'Technologie' | 'Sport' | 'Autre';

type ParsedExercise = {
  kind: 'exercise';
  number: string;
  type: KeyInsightType;
  summary: string;
};

type ParsedCourseSection = {
  kind: 'course';
  title: string;
  summary: string;
};

type Parsed = ParsedExercise | ParsedCourseSection;

/**
 * Parse a keyInsight string in EITHER format.
 *
 * Format 1a (exercice legacy): "Exercice N (Type): résumé"
 *   → ParsedExercise (with type badge)
 *
 * Format 1b (exercice math): "Exercice N: sujet - résumé"  (no type in parens)
 *   → ParsedExercise (with inferred type from resourceType)
 *
 * Format 2 (cours): "Titre: résumé"  (no "Exercice" prefix, no parentheses)
 *   → ParsedCourseSection
 *
 * Returns null if neither format matches.
 */
function parseKeyInsight(ki: string, inferredType?: KeyInsightType | null): Parsed | null {
  // Format 1a: Exercice N (Type): summary  (physique legacy, has type tag)
  const mExTyped = ki.match(/^Exercice\s+(\d+(?:\s*[A-Za-z])?)\s*\(([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]*)\)[:\s]+(.+)$/i);
  if (mExTyped) {
    const typeLower = mExTyped[2].toLowerCase().trim();
    let type: KeyInsightType | null = null;
    if (typeLower === 'physique') type = 'Physique';
    else if (typeLower === 'chimie') type = 'Chimie';
    else if (typeLower === 'math' || typeLower === 'maths' || typeLower === 'mathématiques') type = 'Math';
    else if (typeLower === 'svt' || typeLower === 'sciences de la vie et de la terre') type = 'SVT';
    if (type) {
      return {
        kind: 'exercise',
        number: mExTyped[1].trim(),
        type,
        summary: mExTyped[3].trim(),
      };
    }
  }

  // Format 1b: "Exercice N: sujet - résumé"  (math new format, no type tag)
  //   - Must start with "Exercice" + number + colon
  //   - No parentheses allowed (those are Format 1a)
  const mExPlain = ki.match(/^Exercice\s+(\d+(?:\s*[A-Za-z])?)\s*:\s*(.+)$/i);
  if (mExPlain) {
    // Use inferred type from resourceType, default to Math
    let type: KeyInsightType = inferredType || 'Math';
    return {
      kind: 'exercise',
      number: mExPlain[1].trim(),
      type,
      summary: mExPlain[2].trim(),
    };
  }

  // Format 2: "Titre: résumé" (cours)
  //   - Title does NOT start with "Exercice" (Format 1b catches that)
  //   - Must have at least one colon
  //   - Title must be non-empty, summary must be non-empty
  const mCourse = ki.match(/^([A-ZÀ-ÿ«'][^:]+?):\s*(.+)$/);
  if (mCourse) {
    const title = mCourse[1].trim();
    const summary = mCourse[2].trim();
    // Reject if title looks like "Exercice X" (should be caught by Format 1b)
    if (title && summary && title.length < 200 && summary.length > 5 && !/^Exercice\b/i.test(title)) {
      return { kind: 'course', title, summary };
    }
  }

  return null;
}

const TYPE_ICON: Record<KeyInsightType, typeof Atom> = {
  Physique: Atom,
  Chimie: FlaskConical,
  Math: Atom,
  SVT: FlaskConical,
  Anglais: BookOpen,
  Français: BookOpen,
  Arabe: BookOpen,
  Philosophie: BookOpen,
  Histoire: BookOpen,
  Géographie: BookOpen,
  Économie: BookOpen,
  Gestion: BookOpen,
  Informatique: Cog,
  Technologie: Wrench,
  Sport: Zap,
  Autre: FileText,
};

const TYPE_COLOR: Record<KeyInsightType, string> = {
  Physique: 'bg-blue-100 text-blue-700 border-blue-200',
  Chimie: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Math: 'bg-violet-100 text-violet-700 border-violet-200',
  SVT: 'bg-amber-100 text-amber-700 border-amber-200',
  Anglais: 'bg-sky-100 text-sky-700 border-sky-200',
  Français: 'bg-rose-100 text-rose-700 border-rose-200',
  Arabe: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Philosophie: 'bg-purple-100 text-purple-700 border-purple-200',
  Histoire: 'bg-amber-100 text-amber-700 border-amber-200',
  Géographie: 'bg-teal-100 text-teal-700 border-teal-200',
  Économie: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Gestion: 'bg-orange-100 text-orange-700 border-orange-200',
  Informatique: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Technologie: 'bg-slate-100 text-slate-700 border-slate-200',
  Sport: 'bg-red-100 text-red-700 border-red-200',
  Autre: 'bg-slate-100 text-slate-700 border-slate-200',
};

const TYPE_COLOR_DARK: Record<KeyInsightType, string> = {
  Physique: 'bg-blue-50 text-blue-600 border-blue-200',
  Chimie: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  Math: 'bg-violet-50 text-violet-600 border-violet-200',
  SVT: 'bg-amber-50 text-amber-700 border-amber-200',
  Anglais: 'bg-sky-50 text-sky-600 border-sky-200',
  Français: 'bg-rose-50 text-rose-600 border-rose-200',
  Arabe: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  Philosophie: 'bg-purple-50 text-purple-600 border-purple-200',
  Histoire: 'bg-amber-50 text-amber-700 border-amber-200',
  Géographie: 'bg-teal-50 text-teal-600 border-teal-200',
  Économie: 'bg-yellow-50 text-yellow-600 border-yellow-200',
  Gestion: 'bg-orange-50 text-orange-600 border-orange-200',
  Informatique: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  Technologie: 'bg-slate-50 text-slate-600 border-slate-200',
  Sport: 'bg-red-50 text-red-600 border-red-200',
  Autre: 'bg-slate-50 text-slate-600 border-slate-200',
};

export default function AiExerciseOverview({
  keyInsights,
  subjectSlug,
  resourceType = null,
  meta = null,
}: AiExerciseOverviewProps) {
  if (!keyInsights || keyInsights.length === 0) return null;

  // Map subjectSlug to KeyInsightType so we can tag the badge correctly
  const slugToType: Record<string, KeyInsightType> = {
    'mathematiques': 'Math',
    'physique': 'Physique',
    'svt': 'SVT',
    'anglais': 'Anglais',
    'francais': 'Français',
    'arabe': 'Arabe',
    'philosophie': 'Philosophie',
    'histoire': 'Histoire',
    'geographie': 'Géographie',
    'economie': 'Économie',
    'gestion': 'Gestion',
    'informatique': 'Informatique',
    'technologie': 'Technologie',
    'sport': 'Sport',
    // Chimie is a sub-type of Physique
  };
  const inferredType = subjectSlug ? slugToType[subjectSlug] ?? 'Autre' : 'Math';

  const parsed = keyInsights
    .map(ki => parseKeyInsight(ki, inferredType))
    .filter((p): p is Parsed => p !== null);

  // If no parseable insights, don't render the card
  if (parsed.length === 0) return null;

  // Detect mode from actual data
  const allExercises = parsed.every((p) => p.kind === 'exercise');
  const allCourse = parsed.every((p) => p.kind === 'course');
  const isCourse = resourceType === 'COURSE' || (allCourse && !allExercises);
  const isExercises = !isCourse;

  const title = isCourse ? 'Aperçu du cours' : 'Aperçu des exercices';
  const Icon = isCourse ? BookOpen : ListChecks;
  const sectionCount = isCourse ? parsed.length : null;

  // Exercise mode counts
  const physiqueCount = parsed.filter((p) => p.kind === 'exercise' && (p as ParsedExercise).type === 'Physique').length;
  const chimieCount = parsed.filter((p) => p.kind === 'exercise' && (p as ParsedExercise).type === 'Chimie').length;
  const mathCount = parsed.filter((p) => p.kind === 'exercise' && (p as ParsedExercise).type === 'Math').length;
  const svtCount = parsed.filter((p) => p.kind === 'exercise' && (p as ParsedExercise).type === 'SVT').length;

  // Color palette for meta chips
  const META_COLORS: Record<string, string> = {
    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    rose: 'bg-rose-100 text-rose-700 border-rose-200',
    sky: 'bg-sky-100 text-sky-700 border-sky-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  const ICON_MAP: Record<string, typeof Wrench> = {
    wrench: Wrench,
    cog: Cog,
    zap: Zap,
    book: BookOpen,
    file: FileText,
    flask: FlaskConical,
    atom: Atom,
  };

  return (
    <AiContentSection
      title={title}
      icon={<Icon className="w-4 h-4" />}
      badge="AI"
      defaultOpen={false}
      subjectSlug={subjectSlug}
    >
      {/* Summary chips: meta (if provided) OR counts per type (exercises) OR section count (course) */}
      {meta && meta.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3 text-sm">
          {meta.map((m, i) => {
            const IconComponent = m.icon ? ICON_MAP[m.icon] : null;
            const color = META_COLORS[m.color || 'indigo'] || META_COLORS.indigo;
            return (
              <span key={i} className={`inline-flex items-center gap-1.5 font-semibold ${color.split(' ')[1] || 'text-slate-700'}`}>
                {IconComponent && <IconComponent className="w-3.5 h-3.5" />}
                <span>{m.label}</span>
                {i < meta.length - 1 && (
                  <span className="text-slate-300 font-normal">|</span>
                )}
              </span>
            );
          })}
        </div>
      ) : isCourse ? (
        sectionCount && sectionCount > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full border bg-indigo-100 text-indigo-700 border-indigo-200">
              <BookOpen className="w-3 h-3" />
              {sectionCount} section{sectionCount > 1 ? 's' : ''} du cours
            </span>
          </div>
        ) : null
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {/* If all exercises are same type, show ONE chip with the subject name.
              Otherwise, show one chip per type. */}
          {(() => {
            const exerciseTypes: ParsedExercise[] = (parsed as Parsed[]).filter((p): p is ParsedExercise => p.kind === 'exercise');
            const types: KeyInsightType[] = Array.from(new Set(exerciseTypes.map((p) => p.type)));
            const totalExercises = exerciseTypes.length;
            
            if (types.length === 0) return null;
            
            // CASE 1: All same type → show "N exercices {typeLabel}" with appropriate color
            if (types.length === 1) {
              const t = types[0];
              const typeLabel: string = t === 'Math' ? 'math' :
                                t === 'SVT' ? 'SVT' :
                                t.toLowerCase();
              const Icon = TYPE_ICON[t];
              return (
                <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full border ${TYPE_COLOR[t]}`}>
                  <Icon className="w-3 h-3" />
                  {totalExercises} exercice{totalExercises > 1 ? 's' : ''} {typeLabel}
                </span>
              );
            }
            
            // CASE 2: Mixed types → show one chip per type
            return types.map((t) => {
              const count = exerciseTypes.filter((p) => p.type === t).length;
              const typeLabel: string = t === 'Math' ? 'math' :
                                t === 'SVT' ? 'SVT' :
                                t.toLowerCase();
              const Icon = TYPE_ICON[t];
              return (
                <span key={t} className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full border ${TYPE_COLOR[t]}`}>
                  <Icon className="w-3 h-3" />
                  {count} exercice{count > 1 ? 's' : ''} {typeLabel}
                </span>
              );
            });
          })()}
          </div>
      )}

      {/* Numbered list — clean: just text, no badges */}
      <ol className="space-y-2 list-decimal ps-5 marker:text-slate-400 marker:font-bold">
        {parsed.map((p, idx) => {
          if (p.kind === 'exercise') {
            // Exercise: title in bold (incl "Exercice N: sujet") + summary
            // The "Ex. N · Math" badge is removed — numbering comes from <ol>
            return (
              <li
                key={idx}
                className="p-2.5 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 transition-colors"
              >
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  Exercice {p.number}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed mt-1">
                  {p.summary}
                </p>
              </li>
            );
          } else {
            // Course section — clean: title in bold + summary, no badge
            return (
              <li
                key={idx}
                className="p-2.5 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 transition-colors"
              >
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  {p.title}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed mt-1">
                  {p.summary}
                </p>
              </li>
            );
          }
        })}
      </ol>
    </AiContentSection>
  );
}

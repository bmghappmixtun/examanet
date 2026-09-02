// Vercel force rebuild - real change for Vercel to detect
// 2026-07-30: removed 'use client' — was forcing the entire 653-line card
// to ship as client JS. The only client state was a hover tooltip, which
// has been extracted to AiBadge.tsx (a 25-line client island using pure
// CSS :hover instead of useState). This saves ~40 KB gz from the
// resource page bundle.

import {
  Sparkles,
  User,
  Building2,
  GraduationCap,
  CalendarDays,
  BookOpen,
  FileText,
  ListChecks,
  ScrollText,
  Tag,
} from 'lucide-react';
import { isArabic } from '@/lib/text-utils';
import AiBadge from './AiBadge';

interface HeaderData {
  school?: string | null;
  teacher?: string | null;
  level?: string | null;
  /** Educational cycle (Enseignement de base | Enseignement Secondaire) — FR */
  cycle?: string | null;
  /** Educational cycle in Arabic (التعليم الأساسي | التعليم الثانوي) */
  cycleAr?: string | null;
  subject?: string | null;
  year?: string | null;
  type?: string | null;
}

interface AiDescriptionProps {
  /** When true, hide the internal "Résumé intelligent" header. Use when the
   *  component is wrapped in an AiContentSection (which already provides the title). */
  hideTitle?: boolean;
  /** The description text (already in target language). */
  text: string;
  /** Optional 2nd summary in the original document language (de/it/es for 3L files).
   *  When provided, displayed in the same card below the main summary with its own
   *  language detection. */
  secondaryText?: string | null;
  /** Origin of the description: 'agent-v2-multilingual' | 'manual' | null */
  source: string | null | undefined;
  /** Resource language code ('ar' | 'fr' | 'en'). Drives RTL direction. */
  language?: string | null;
  /** Optional CSS class for the description text wrapper. */
  className?: string;
  /** Optional header data extracted from PDF (school/teacher/year etc.). */
  headerData?: HeaderData | null;
  /** Override Classe value with the full class name (e.g. "9ème année de base"). */
  classNameFr?: string | null;
  /** Override Classe value with the full Arabic class name. */
  classNameAr?: string | null;
  /** Optional general subject (الموضوع العام) to display as a labeled field. */
  generalSubject?: string | null;
  /** Optional subject slug (e.g. "technologie", "mathematiques") — used for subject-specific UI overrides. */
  subjectSlug?: string | null;
  /** Optional system/product name (اسم النظام / اسم المنتج) — for Technologie. */
  systemName?: string | null;
  /** Optional subject display name override (e.g. "التربية التكنولوجية" for Technologie). */
  subjectLabelOverride?: string | null;
  /** If true, hide the Type and Niveau/Cycle fields (always the same for college). */
  isCollege?: boolean | null;
  /** School name (FR/Latin) from the DB resource. */
  dbSchoolNameFr?: string | null;
  /** School name (Arabic) from the DB resource. */
  dbSchoolNameAr?: string | null;
  /** Teacher name (FR/Latin) — full name as `${firstName} ${lastName}`. */
  dbTeacherNameFr?: string | null;
  /** Teacher name (Arabic) — full name as `${firstNameAr} ${lastNameAr}`. */
  dbTeacherNameAr?: string | null;
  /** AI-extracted school name from PDF header (ResourceMetadata.schoolName). */
  aiSchoolName?: string | null;
  /** AI-extracted teacher names (ResourceMetadata.profNames[0]). */
  aiProfNames?: string[] | null;
  /** Resource schoolType ('PILOTE' | 'PUBLIC' | null). When 'PILOTE', show "Pilote" badge next to school name. */
  schoolType?: string | null;
  /** Hide specific field labels in the card grid. Used to drop redundant
   *  attributes (e.g. Sujet général / Enseignant / Classe) for some subjects
   *  where they're already shown in the page header / sidebar. */
  hideFields?: string[] | null;
}

/** Map of FR label → matching AR label. Lets callers pass FR-only labels
 *  (e.g. ['Sujet général']) and have the AR equivalent ('الموضوع العام')
 *  hidden too. */
const HIDE_LABEL_TRANSLATIONS: Record<string, string[]> = {
  'Sujet général': ['الموضوع العام'],
  'Enseignant': ['الأستاذ', 'الأستا ذ', 'المعلم'],
  'Classe': ['الصف', 'السنة الدراسية', 'الفصل'],
  'Type': ['النوع'],
  'Niveau': ['المستوى'],
  'Matière': ['المادة'],
  'Établissement': ['المدرسة', 'المؤسسة'],
  'Année scolaire': ['السنة الدراسية'],
  'Système': ['الظام', 'المنظومة'],
};

type Field = {
  /** Icon component from lucide-react */
  Icon: typeof User;
  /** Localized label, e.g. "الأستاذ" / "Enseignant" */
  label: string;
  /** The value extracted from the description */
  value: string;
};

const LABELS_AR: Record<string, string[]> = {
  teacher: ['الأستاذ', 'الأستا ذ', 'المعلم'],
  school: ['المدرسة', 'المؤسسة'],
  // 'المستوى' removed — cycle (التعليم الأساسي/الثانوي) is now sourced from headerData.cycleAr via tryAdd
  level: ['الصف', 'السنة', 'الفصل'],
  year: ['السنة الدراسية', 'العام الدراسي'],
  subject: ['المادة', 'المـادة'],
  type: ['النوع', 'نوع'],
  exercises: ['التمارين', 'التمرين'],
  summary: ['ملخص', 'الملخص', 'الموضوع', 'ملخص الدرس'],
  concepts: [
    'المفاهيم',
    'المفاهيم/الشخصيات',
    'المفاهيم/المهارات المكتسبة',
    'المفاهيم/الكفاءات المكتسبة',
    'المفاهيم/الكفاءات المعالجة',
    'المفاهيم المكتسبة',
    'الكفاءات المكتسبة',
    'الأفكار الرئيسية',
  ],
};

const LABELS_FR: Record<string, string[]> = {
  teacher: ['Enseignant', 'Professeur', 'Mr', 'Mme'],
  school: ['Établissement', 'Lycée', 'Collège', 'École'],
  // 'Niveau' removed — cycle (Enseignement de base/Secondaire) is now sourced from headerData.cycle via tryAdd
  level: ['Classe', 'Année'],
  year: ['Année scolaire', 'Année'],
  subject: ['Matière', 'Matière', 'Subject'],
  type: ['Type'],
  exercises: ['Exercices', 'Exercice'],
  summary: ['Résumé', 'Description', 'Aperçu', 'Contenu'],
  concepts: ['Concepts', 'Concepts/Maîtrise', 'Notions clés', 'Points clés', 'Compétences'],
};

/**
 * Translate common Latin/FR values to their Arabic equivalents.
 * Used when a cell is RTL (label is Arabic) but the value is in Latin.
 * Per user rule (2026-08-02): "physique" should appear as "الفيزياء" in an
 * Arabic card so the visual flow stays uniform.
 *
 * Only well-known FIXED terms are translated — arbitrary text (school names,
 * teacher names, summaries, year strings) is returned as null (= no change).
 */
function translateValueToArabic(value: string): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  // Skip if already Arabic
  if (/[\u0600-\u06FF]/.test(v)) return null;
  // Skip if contains digits/years (e.g., "2017-2018")
  if (/\d/.test(v) && v.length < 15) return null;

  // Subject mapping
  const subjectMap: Record<string, string> = {
    'physique': 'الفيزياء',
    'physiques': 'الفيزياء',
    'mathématiques': 'الرياضيات',
    'mathematiques': 'الرياضيات',
    'français': 'الفرنسية',
    'francais': 'الفرنسية',
    'arabe': 'العربية',
    'anglais': 'الإنجليزية',
    'informatique': 'الإعلامية',
    'technologie': 'التكنولوجيا',
    'svt': 'علوم الحياة والأرض',
    'sciences de la vie et de la terre': 'علوم الحياة والأرض',
    'histoire-géographie': 'التاريخ-الجغرافيا',
    'histoire': 'التاريخ',
    'géographie': 'الجغرافيا',
    'philosophie': 'الفلسفة',
    'économie': 'الاقتصاد',
    'gestion': 'التسيير',
    'sport': 'الرياضة',
    'éducation islamique': 'التربية الإسلامية',
  };

  const lower = v.toLowerCase();
  if (subjectMap[lower]) return subjectMap[lower];

  // Type mapping
  const typeMap: Record<string, string> = {
    'devoir': 'فرض',
    'devoir de contrôle': 'فرض مراقبة',
    'devoir de synthèse': 'فرض تأليفي',
    'série d\'exercices': 'سلسلة تمارين',
    'serie d exercices': 'سلسلة تمارين',
    'cours': 'درس',
    'résumé': 'ملخص',
    'resume': 'ملخص',
    'exercices': 'تمارين',
    'exercice': 'تمرين',
    'examen': 'امتحان',
    'évaluation': 'تقييم',
    'interrogation': 'استجواب',
    'test': 'اختبار',
  };
  if (typeMap[lower]) return typeMap[lower];

  return null;
}

/**
 * Parse the AI-generated description into structured fields.
 * Each field has a label (in AR or FR) and a value.
 */
function parseFields(
  html: string,
  isAr: boolean,
  bilingual: boolean = false,
): { fields: Field[]; summary: string } {
  // If bilingual mode, merge both label sets. Otherwise pick by detected language.
  const labels: Record<string, string[]> = bilingual
    ? mergeBilingualLabels(LABELS_AR, LABELS_FR, isAr)
    : isAr
      ? LABELS_AR
      : LABELS_FR;
  const fields: Field[] = [];
  let summary = '';

  // First, convert <ul><li>X</li><li>Y</li></ul> into a comma-separated list
  // so it survives the HTML stripping. We use a unique placeholder.
  const lists: string[] = [];
  const withPlaceholders = html.replace(/<ul>([\s\S]*?)<\/ul>/gi, (_m: string, inner: string) => {
    const items = Array.from(inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map(
      (mm: RegExpMatchArray) => (mm[1] || '').replace(/<[^>]+>/g, '').trim(),
    );
    const joined = items.join(', ');
    lists.push(joined);
    return `\u0000LIST${lists.length - 1}\u0000`;
  });

  // Strip HTML tags but preserve <br> as newlines
  const text = withPlaceholders
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>([^<]+)<\/strong>/gi, '$1')
    .replace(/<[^>]+>/g, '');

  // Restore list placeholders to their comma-separated values
  const textWithLists = text.replace(
    /\u0000LIST(\d+)\u0000/g,
    (_m, idx) => lists[parseInt(idx)] || '',
  );

  const lines = textWithLists
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const iconMap: Record<string, typeof User> = {
    teacher: User,
    school: Building2,
    level: GraduationCap,
    year: CalendarDays,
    subject: BookOpen,
    type: FileText,
    exercises: ListChecks,
    summary: ScrollText,
  };

  for (const line of lines) {
    let matched = false;
    for (const [key, labelVariants] of Object.entries(labels)) {
      // Try each label variant for this key
      for (const label of labelVariants) {
        const re = new RegExp(`^${escapeRe(label)}\\s*[:：]\\s*(.+)$`, 'i');
        const m = line.match(re);
        if (m && m[1]) {
          const value = m[1].trim();
          // Skip empty values and placeholder dashes ("-", "—" etc.)
          // so the grid doesn't show useless rows.
          if (value && value !== '-' && value !== '—' && value !== '–') {
            // Use the first (canonical) label for display
            const displayLabel = labels[key][0];
            if (key === 'summary') {
              summary = value;
            } else if (key === 'concepts') {
              // Format concepts as a labeled, comma-separated line appended to summary
              const conceptsLine = `${displayLabel} : ${value}`;
              summary = summary ? `${summary}\n\n${conceptsLine}` : conceptsLine;
            } else {
              fields.push({ Icon: iconMap[key] || FileText, label: displayLabel, value });
            }
          }
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched && fields.length > 0 && !line.match(/^[\u0600-\u06FFa-zA-Z]+\s*[:：]/)) {
      const last = fields[fields.length - 1];
      if (last) last.value = `${last.value} ${line}`;
    } else if (!matched && fields.length === 0 && line) {
      summary = summary ? `${summary} ${line}` : line;
    }
  }

  return { fields, summary };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Merge AR + FR label sets so the parser can handle bilingual descriptions.
 * The display language (passed via isAr) decides which label is shown first.
 */
function mergeBilingualLabels(
  ar: Record<string, string[]>,
  fr: Record<string, string[]>,
  isAr: boolean,
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  const keys = new Set([...Object.keys(ar), ...Object.keys(fr)]);
  for (const key of keys) {
    const arLabels = ar[key] || [];
    const frLabels = fr[key] || [];
    // Put preferred language first (for display)
    merged[key] = isAr ? [...arLabels, ...frLabels] : [...frLabels, ...arLabels];
  }
  return merged;
}

/**
 * Render the resource description as a beautiful info card with icons.
 *
 * RTL handling: We rely on the browser's natural RTL flow via `dir="rtl"`.
 * - In RTL: the icon (first child in DOM) appears on the RIGHT
 * - In LTR: the icon appears on the LEFT
 * No flex-row-reverse needed — the dir attribute handles it correctly.
 */
export default function AiDescription({

// CACHE_BUST_V2_2026_08_03_1115_BUILD_AR_FOR_AR_DOCS
  text,
  secondaryText,
  source,
  language,
  className = '',
  hideTitle = false,
  headerData,
  classNameFr,
  classNameAr,
  generalSubject,
  subjectSlug,
  systemName,
  subjectLabelOverride,
  isCollege = false,
  dbSchoolNameFr,
  dbSchoolNameAr,
  dbTeacherNameFr,
  dbTeacherNameAr,
  aiSchoolName,
  aiProfNames,
  schoolType,
  hideFields,
}: AiDescriptionProps) {
  const isAi = !!source && source.startsWith('agent-');

  // Auto-detect language from content: count Arabic vs Latin characters.
  // Some PDFs were imported with wrong language in DB (e.g. lang='fr' but
  // description is in Arabic). This prevents the parser from picking the
  // wrong label set and dumping everything into the summary.
  const arabicCharCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinCharCount = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const detectedLang = arabicCharCount > latinCharCount * 0.3 ? 'ar' : language || 'fr';
  const isRtl = detectedLang === 'ar';

  const html = text
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>')
    .replace(/<br>\s*<br>/g, '<br><br>');
  // Try both AR and FR labels regardless of detected language, because
  // many descriptions mix languages (FR labels with AR values, or vice versa).
  const { fields: parsedFields, summary } = parseFields(html, isRtl, true);

  // Merge headerData fields (PDF header extraction) into the field list.
  // Skip any field that the AI description already provided (avoid duplication).
  const existingLabels = new Set(parsedFields.map((f) => f.label));
  const headerFields: Field[] = [];
  if (headerData) {
    const h = headerData;
    const tryAdd = (
      labelAr: string,
      labelFr: string,
      val: string | null | undefined,
      Icon: typeof User,
    ) => {
      if (!val || typeof val !== 'string') return;
      const v = val.trim();
      if (!v || v === 'null' || v === 'None') return;
      const lbl = isRtl ? labelAr : labelFr;
      if (existingLabels.has(lbl)) return;
      headerFields.push({ Icon, label: lbl, value: v });
      existingLabels.add(lbl);
    };
    // tryOverride: always set/override the value (used for fields we want authoritative)
    const tryOverride = (
      labelAr: string,
      labelFr: string,
      val: string | null | undefined,
      Icon: typeof User,
    ) => {
      if (!val || typeof val !== 'string') return;
      const v = val.trim();
      if (!v || v === 'null' || v === 'None') return;
      const lbl = isRtl ? labelAr : labelFr;
      const idx = parsedFields.findIndex((f) => f.label === lbl);
      if (idx >= 0) {
        parsedFields[idx] = { ...parsedFields[idx], value: v };
      } else {
        headerFields.push({ Icon, label: lbl, value: v });
        existingLabels.add(lbl);
      }
    };
    // 2026-08-18 (User feedback): hide the AI-extracted PDF header attributes
    // (Année scolaire, Matière, Type, Établissement) from the AI summary card.
    // Per user rule: "on supprime de la card resumé ia les attributs ia
    // (année, matiere, type , etablissement, etc.. on laisse ça juste dans la db)".
    // These attributes remain in the DB (Resource + ResourceMetadata) for
    // SEO, search filtering, and the title format — they're just not shown
    // in the visible "Résumé intelligent" card anymore.
    //
    // The teacher (Enseignant) is still useful info so we keep it.
    tryAdd('\u0627\u0644\u0623\u0633\u062a\u0627\u0630', 'Enseignant', h.teacher, User);
    // ANNÉE SCOLAIRE — REMOVED (kept in DB only)
    // tryAdd(
    //   '\u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u062f\u0631\u0627\u0633\u064a\u0629',
    //   'Ann\u00e9e scolaire',
    //   h.year,
    //   CalendarDays,
    // );
    // MATIÈRE — REMOVED (kept in DB only)
    // tryAdd('\u0627\u0644\u0645\u0627\u062f\u0629', 'Mati\u00e8re', h.subject, BookOpen);
    // TYPE — REMOVED (kept in DB only)
    // tryAdd('\u0627\u0644\u0646\u0648\u0639', 'Type', h.type, FileText);
    // ÉTABLISSEMENT — REMOVED (kept in DB only)
    // tryAdd('\u0627\u0644\u0645\u062f\u0631\u0633\u0629', '\u00c9tablissement', h.school, Building2);
    // Override 'المستوى'/'Niveau' with the authoritative cycle from headerData
    // (AI description sometimes uses the class name as level, but they are different).
    // SKIP for college: cycle is always "Enseignement de base" → no informative value.
    if (!isCollege) {
      tryOverride(
        '\u0627\u0644\u0645\u0633\u062a\u0648\u0649',
        'Niveau',
        isRtl ? h.cycleAr || h.cycle : h.cycle,
        GraduationCap,
      );
    }
  }

  // Add the general subject (الموضوع العام) as a labeled field if provided.
  // Tag icon for the topic, displayed in the grid.
  if (generalSubject) {
    const subjValue = String(generalSubject).trim();
    if (subjValue && subjValue !== '-' && subjValue !== '—' && subjValue !== '–') {
      const subjLabel = isRtl ? 'الموضوع العام' : 'Sujet général';
      if (!existingLabels.has(subjLabel)) {
        headerFields.push({ Icon: Tag, label: subjLabel, value: subjValue });
        existingLabels.add(subjLabel);
      }
    }
  }

  // Per user rule (2026-08-13): the "Système étudié" attribute was removed
  // from the AI summary card. The system name is already shown in the green
  // cadre at the top of the page (with the "Système technique" label),
  // so we skip it here to avoid redundancy.
  // (Previously: `if (systemName && subjectSlug === 'technologie') { ... }`)

  // ===== School (المدرسة) and Teacher (الأستاذ) =====
  // Per user rule (2026-07-30):
  //   "si l'attribut affiché est en Ar sinon on prend l'attribut extrait avec l'ia"
  //   + "ajouter 'nom de l'ecole' et 'le nom du prof' s'ils sont disponibles ou s'ils sonnt extraits par l'ia"
  //   → if the displayed value is already in AR, keep it; otherwise (FR) prefer the AI-extracted version.
  // Priority chain (per field):
  //   1. Parser-extracted value IF it is already in AR
  //   2. DB AR field  (resource.schoolNameAr / teacher.firstNameAr + lastNameAr)
  //   3. AI-extracted AR value (ResourceMetadata.schoolName / profNames[0]) if Arabic
  //   4. DB FR field  (resource.schoolName / teacher.firstName + lastName)
  //   5. AI-extracted FR value (if no AR anywhere)
  const schoolLabel = isRtl ? 'المدرسة' : 'Établissement';
  const teacherLabel = isRtl ? 'الأستاذ' : 'Enseignant';
  const pickPreferringAr = (
    displayed: string | null | undefined,
    dbAr: string | null | undefined,
    dbFr: string | null | undefined,
    aiAr: string | null | undefined,
    aiFr: string | null | undefined,
  ): string | null => {
    const clean = (v: string | null | undefined) => {
      if (!v) return null;
      const t = String(v).trim();
      if (!t || t === '-' || t === '—' || t === '–' || t === 'null' || t === 'None') return null;
      return t;
    };
    const d = clean(displayed);
    const ar = clean(dbAr);
    const fr = clean(dbFr);
    const aiar = clean(aiAr);
    const aifr = clean(aiFr);
    // Each AR-tagged value must actually contain Arabic chars to be eligible
    // as the AR preferred value — some DB rows have Latin chars in *Ar fields
    // (corrupted at import). Falling through to the next option in that case.
    const isAr = (v: string | null) => !!v && isArabic(v);
    if (isAr(d)) return d; // already in AR → keep
    if (isAr(ar)) return ar;
    if (isAr(aiar)) return aiar;
    if (d) return d;
    if (fr) return fr;
    if (aifr) return aifr;
    return null;
  };
  // Build school value — 2026-08-18: hide school from the card per user
  // feedback (kept in DB only). All school-related code is now no-op.
  // The unused variables (schoolLabel, schoolDisplayed, pickPreferringAr)
  // are kept as no-ops to avoid touching more of the parser logic.
  void schoolLabel;
  void dbSchoolNameAr;
  void dbSchoolNameFr;
  void aiSchoolName;
  void pickPreferringAr;
  // Build teacher value — Per user rule (2026-08-03):
  //   If the file is in AR → display the AR prof name (if not null)
  //   If the file is in FR → display the FR prof name (if not null)
  //   Fallback chain: language-appropriate DB field → AI profNames → headerData.teacher
  const teacherDisplayed =
    parsedFields.find((f) => f.label === teacherLabel)?.value ??
    headerFields.find((f) => f.label === teacherLabel)?.value ??
    (headerData?.teacher ?? null);
  const teacherAiFirst =
    aiProfNames && aiProfNames.length > 0 ? aiProfNames[0] : null;
  // Compute preferred value based on the FILE's language (not on the displayed text)
  let teacherValue: string | null = null;
  if (language === 'ar') {
    // AR file → prefer AR (dbTeacherNameAr), then AI AR (profNames), then displayed, then FR fallback
    teacherValue = pickPreferringAr(
      null,                              // skip displayed FR — prefer AR explicitly
      dbTeacherNameAr,
      dbTeacherNameFr,
      teacherAiFirst,
      teacherDisplayed,                  // FR fallback (only if no AR anywhere)
    );
  } else {
    // FR file → prefer FR (dbTeacherNameFr), then displayed, then headerData.teacher
    const frValue = dbTeacherNameFr || teacherDisplayed || (headerData?.teacher ?? null);
    teacherValue = frValue || dbTeacherNameAr || teacherAiFirst || null;
  }
  if (teacherValue) {
    const idx = parsedFields.findIndex((f) => f.label === teacherLabel);
    if (idx >= 0) {
      parsedFields[idx] = { ...parsedFields[idx], value: teacherValue };
    } else {
      const hfIdx = headerFields.findIndex((f) => f.label === teacherLabel);
      if (hfIdx >= 0) {
        headerFields[hfIdx] = { ...headerFields[hfIdx], value: teacherValue };
      } else {
        headerFields.push({ Icon: User, label: teacherLabel, value: teacherValue });
      }
    }
  }

  // ===== College-only filter (2026-07-30) =====
  // For college, remove the Type (النوع) and Niveau/Cycle (المستوى) fields.
  // These are always the same for all college resources, so they add no value.
  let filteredParsed = parsedFields;
  let filteredHeader = headerFields;
  if (isCollege) {
    const collegeSkipLabels = new Set([
      isRtl ? 'النوع' : 'Type',
      isRtl ? 'المستوى' : 'Niveau',
    ]);
    filteredParsed = parsedFields.filter((f) => !collegeSkipLabels.has(f.label));
    filteredHeader = headerFields.filter((f) => !collegeSkipLabels.has(f.label));
  }

  // ===== Per-subject custom field hiding (2026-08-06) =====
  // Some subjects want specific fields dropped from the card (they're already
  // in the page header / sidebar). Caller passes `hideFields` with the label
  // strings to suppress. The actual filter is applied later to the final
  // `fields` array (see "Final hideFields pass" below) so it catches fields
  // that get re-added by overrides like the Classe override.
  const fields = [...filteredParsed, ...filteredHeader];

  // Subject override: for Technologie, the "matière" field should display
  // "التربية التكنولوجية" (educational technology) instead of "التكنولوجيا" (technology).
  if (subjectLabelOverride && subjectSlug === 'technologie') {
    const subjLabel = isRtl ? 'المادة' : 'Matière';
    const idx = fields.findIndex((f) => f.label === subjLabel);
    if (idx >= 0) {
      fields[idx] = { ...fields[idx], value: subjectLabelOverride };
    }
  }

  // Override Classe value with full class name from props (e.g. "9ème année de base")
  // Some AI-generated descriptions have truncated values like "9ème année" — use the
  // authoritative class name from the DB instead.
  if (classNameFr || classNameAr) {
    const fullClass = isRtl ? classNameAr || classNameFr : classNameFr || classNameAr;
    const classeLabel = isRtl ? 'الصف' : 'Classe';
    const idx = fields.findIndex((f) => f.label === classeLabel);
    if (fullClass) {
      if (idx >= 0) {
        fields[idx] = { ...fields[idx], value: fullClass };
      } else {
        fields.push({ Icon: GraduationCap, label: classeLabel, value: fullClass });
      }
    }
  }

  // ===== Final hideFields pass (2026-08-06) =====
  // Re-apply the hide filter to the final `fields` array because the
  // Classe override above may have re-added a "Classe" field after our
  // earlier filter. This is the single source of truth for what to render.
  let displayFields = fields;
  if (hideFields && hideFields.length > 0) {
    const hideSet = new Set<string>();
    for (const label of hideFields) {
      hideSet.add(label);
      hideSet.add(label.toLowerCase());
      const arAliases = HIDE_LABEL_TRANSLATIONS[label];
      if (arAliases) {
        for (const ar of arAliases) hideSet.add(ar);
      }
    }
    displayFields = fields.filter((f) => !hideSet.has(f.label));
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={language || 'fr'}
      className={`relative rounded-xl border border-violet-200/60 bg-gradient-to-br from-violet-50/50 via-white to-indigo-50/30 p-4 shadow-sm ${className}`}
    >
      {/* Header */}
      {!hideTitle && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="flex items-center gap-2 mb-3 pb-2 border-b border-violet-100"
        >
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </span>
          <span className={`font-bold text-sm text-slate-800 flex-1 ${isRtl ? 'font-arabic-title' : ''}`}>
            {isRtl ? 'ملخص ذكي' : 'Résumé intelligent'}
          </span>

          {isAi && <AiBadge isRtl={isRtl} />}
        </div>
      )}

      {/* Info grid — natural RTL flow via dir="rtl" */}
      {displayFields.length > 0 && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 mb-3"
        >
          {displayFields.map((f, i) => {
            const valueAr = isArabic(f.value);
            const labelAr = isArabic(f.label);
            // Cell direction follows the LABEL (not the value). This keeps
            // neutral content (digits, dates, punctuation) aligned with its
            // label instead of breaking to the opposite side in RTL grids.
            const cellRtl = labelAr;
            // Per user rule (2026-08-02): when the cell is RTL but the VALUE
            // is in Latin (e.g. "physique", "mathématiques"), translate the
            // value to its Arabic equivalent so the card looks uniform.
            // We only translate well-known fixed terms; arbitrary text
            // (school names, teacher names, summaries) is left as-is.
            let displayValue = f.value;
            if (cellRtl && !valueAr) {
              const translated = translateValueToArabic(f.value);
              if (translated) displayValue = translated;
            }
            // Per user rule (2026-08-02): show "Pilote" badge next to school
            // name when schoolType === 'PILOTE'. Building2 icon = school field.
            const isSchoolField = f.Icon === Building2;
            const showPiloteBadge = isSchoolField && schoolType === 'PILOTE';
            return (
            <div
              key={i}
              dir={cellRtl ? 'rtl' : 'ltr'}
              className="flex items-start gap-2"
            >
              <f.Icon className={`w-4 h-4 mt-1 flex-shrink-0 ${iconColor(f.Icon)}`} />
              <div className="flex-1 min-w-0">
                <div
                  dir={labelAr ? 'rtl' : 'ltr'}
                  lang={labelAr ? 'ar' : 'fr'}
                  className={`text-[11px] font-bold text-slate-500 uppercase tracking-wide leading-none mb-1 flex items-center gap-1.5 justify-between ${labelAr ? 'text-right' : 'text-left'} ${labelAr ? 'font-arabic-title' : ''}`}
                >
                  <span>{f.label}</span>
                  {showPiloteBadge && (
                    <span
                      dir="ltr"
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase"
                      title="Établissement pilote"
                    >
                      <GraduationCap className="w-2.5 h-2.5" />
                      Pilote
                    </span>
                  )}
                </div>
                <div
                  dir={cellRtl ? 'rtl' : 'ltr'}
                  lang={valueAr ? 'ar' : 'fr'}
                  style={{ unicodeBidi: 'isolate' }}
                  className={`text-sm text-slate-800 font-medium leading-snug break-words ${cellRtl ? 'text-right' : 'text-left'} ${(valueAr || (cellRtl && !valueAr && displayValue !== f.value)) ? 'font-arabic-title' : ''}`}
                >
                  {displayValue}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Summary block — no top border/extra padding because the header
          already has `border-b border-violet-100` and `pb-2`. When the info
          grid is empty (e.g. math lycée with all 3 fields hidden), keeping
          a second border would stack two lines under "Résumé intelligent". */}
      {summary && (() => {
        const summaryAr = isArabic(summary);
        return (
        <div dir={summaryAr ? 'rtl' : 'ltr'} className="mt-3">
          <div className="flex items-start gap-2">
            <ScrollText className="w-4 h-4 mt-1 flex-shrink-0 text-violet-600" />
            <div
              dir={summaryAr ? 'rtl' : 'ltr'}
              lang={summaryAr ? 'ar' : 'fr'}
              style={{
                unicodeBidi: 'isolate',
                whiteSpace: 'pre-wrap',
                ...(summaryAr
                  ? {
                      fontFamily:
                        'var(--font-fustat), "Cairo", "Inter", system-ui, sans-serif',
                      lineHeight: 1.85,
                    }
                  : {}),
              }}
              className={`flex-1 text-sm text-slate-700 leading-relaxed ${summaryAr ? 'text-right' : 'text-left'}`}
            >
              {summary}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Per user rule (2026-08-08): for 3L files, show the 2nd summary in the
          original document language (de/it/es) below the main FR summary, in
          the same AI summary card. Each block has its own lang/dir. */}
      {secondaryText && (() => {
        const secAr = isArabic(secondaryText);
        return (
        <div dir={secAr ? 'rtl' : 'ltr'} className="mt-3 pt-3 border-t border-violet-100">
          <div className="flex items-start gap-2">
            <ScrollText className="w-4 h-4 mt-1 flex-shrink-0 text-violet-600" />
            <div
              dir={secAr ? 'rtl' : 'ltr'}
              lang={secAr ? 'ar' : (language || 'fr')}
              style={{
                unicodeBidi: 'isolate',
                whiteSpace: 'pre-wrap',
                ...(secAr
                  ? {
                      fontFamily:
                        'var(--font-fustat), "Cairo", "Inter", system-ui, sans-serif',
                      lineHeight: 1.85,
                    }
                  : {}),
              }}
              className={`flex-1 text-sm text-slate-700 leading-relaxed ${secAr ? 'text-right' : 'text-left'}`}
            >
              {secondaryText}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

/** Pick a distinct color for each icon type to make the card more vibrant. */
function iconColor(Icon: typeof User): string {
  if (Icon === User) return 'text-blue-600';
  if (Icon === Building2) return 'text-emerald-600';
  if (Icon === GraduationCap) return 'text-purple-600';
  if (Icon === CalendarDays) return 'text-orange-600';
  if (Icon === BookOpen) return 'text-rose-600';
  if (Icon === FileText) return 'text-cyan-600';
  if (Icon === ListChecks) return 'text-amber-600';
  if (Icon === ScrollText) return 'text-violet-600';
  if (Icon === Tag) return 'text-fuchsia-600';
  return 'text-slate-600';
}

// Force rebuild for bilingual parser - 1782666834

// Build marker 2026-06-30-12:40
// last deployed: Mon Aug  3 08:06:17 UTC 2026

// CACHE_BUST_1785747115

/**
 * Title parser for tunisiecollege.net / devoirat.net imports.
 *
 * Detects from the site title:
 *   - type (COURSE / DEVOIR / EXERCISE / etc.)
 *   - homeworkSubtype (CONTROL / SYNTHESIS / HOUSEWORK)
 *   - homeworkNumber (1..20)
 *   - trimester (auto-inferred from homeworkNumber)
 *   - schoolType (PUBLIC / PILOTE)
 *   - subjectSlug (best-effort, returns slug or null)
 *   - classSlug (returns slug or null)
 *   - language ('fr' / 'ar')
 *   - product (المنتج) — free-text Arabic for technologie collège
 */
export interface ParsedTitle {
  type: string;           // COURSE | DEVOIR | EXERCISE | REVISION | EXAM | BAC_SUBJECT | CORRECTION | SUMMARY | OTHER
  homeworkSubtype?: string; // CONTROL | SYNTHESIS | HOUSEWORK (only when type=DEVOIR)
  homeworkNumber?: number;  // 1..20 (only when type=DEVOIR)
  trimester?: string;       // T1 | T2 | T3 (auto from homeworkNumber)
  schoolType?: string;      // PUBLIC | PILOTE
  subjectSlug?: string | null;
  classSlug?: string | null;
  language: 'fr' | 'ar' | 'fr+ar';
  product?: string;         // للمنتج (Arabic text for technologie collège)
  hasArabic: boolean;
  hasCorrection: boolean;   // Detected from "avec corrigé" / "et corrigé" markers
}

// Tunisian class slug mapping
function mapClassSlug(numStr: string, isArabic: boolean): string | null {
  const n = parseInt(numStr, 10);
  if (Number.isNaN(n)) return null;
  // College 7-9ème
  if (n === 7) return '7eme';
  if (n === 8) return '8eme';
  if (n === 9) return '9eme';
  // Lycée 1-4ème année secondaire
  if (n === 1) return '1ere-secondaire';
  if (n === 2) return '2eme-secondaire';
  if (n === 3) return '3eme-secondaire';
  if (n === 4) return '4eme-secondaire';
  // Primary (still kept in case some leak through)
  if (n === 5) return '5eme';
  if (n === 6) return '6eme';
  return null;
}

// Subject detection (FR/AR both supported)
const SUBJECT_MAP: { patterns: RegExp[]; slug: string }[] = [
  { patterns: [/\bmath[eé]matiques?\b/i, /رياضيات/i, /\bmaths?\b/i], slug: 'mathematiques' },
  { patterns: [/\bphysique\b/i, /علوم فيزيائية/i, /فيزياء/i], slug: 'physique' },
  { patterns: [/\bsvt\b/i, /sciences?\s+(de la )?vie/i, /علوم الحياة/i, /علوم طبيعية/i], slug: 'svt' },
  { patterns: [/\bfran[çc]ais\b/i, /français/i], slug: 'francais' },
  { patterns: [/\banglais\b/i, /إنقليزية/i, /إنجليزية/i], slug: 'anglais' },
  { patterns: [/\barabe\b/i, /عربية/i], slug: 'arabe' },
  { patterns: [/\bhistoire\b/i, /تاريخ/i], slug: 'histoire' },
  { patterns: [/\bg[ée]ographie\b/i, /جغرافيا/i], slug: 'geographie' },
  { patterns: [/\binformatique\b/i, /إعلامية/i], slug: 'informatique' },
  { patterns: [/\btechnologie\b/i, /تكنولوجيا/i], slug: 'technologie' },
  { patterns: [/\bphilosophie\b/i, /فلسفة/i], slug: 'philosophie' },
  { patterns: [/\b[eé]conomie\b/i, /اقتصاد/i], slug: 'economie' },
  { patterns: [/\bgestion\b/i, /تصرف/i], slug: 'gestion' },
  { patterns: [/\bsport\b/i, /[eé]ducation physique/i, /رياضة/i, /تربية بدنية/i], slug: 'sport' },
  { patterns: [/\bmusique\b/i, /موسيقى/i], slug: 'musique' },
  { patterns: [/\balgo\b/i, /algorithme/i, /algorithmique/i, /خوارزمية/i], slug: 'algo-prog' },
  { patterns: [/\btic\b/i], slug: 'tic' },
  { patterns: [/[eé]ducation civique/i, /تربية مدنية/i], slug: 'education-civique' },
  { patterns: [/[eé]ducation islamique/i, /تربية إسلامية/i], slug: 'education-islamique' },
  { patterns: [/pens[ée]e islamique/i, /تفكير إسلامي/i], slug: 'pensee-islamique' },
];

function detectSubject(title: string): string | null {
  for (const entry of SUBJECT_MAP) {
    for (const re of entry.patterns) {
      if (re.test(title)) return entry.slug;
    }
  }
  return null;
}

// Homework subtype detection
function detectHomeworkSubtype(title: string): string | null {
  // Devoir de Contrôle (FR + typos)
  if (/contr[oôö]le/i.test(title) || /devoir.*controle/i.test(title)) return 'CONTROLE';
  // Devoir de Synthèse
  if (/synth[eèéê]se|synt[eèéê]se/i.test(title)) return 'SYNTHESE';
  // Devoir de Révision
  if (/r[eéè]vision/i.test(title)) return 'REVISION';
  // Devoir de Maison
  if (/\bmaison\b/i.test(title) || /واجب منزلي/i.test(title)) return 'MAISON';
  return null;
}

// Homework number (N°X)
function detectHomeworkNumber(title: string): number | null {
  // FR: "N°1", "N° 2", "n°3", "Numéro 4"
  // AR: "الفرض الأول", "الفرض 1"
  let m = title.match(/N[°o\u00ba]\s*(\d+)|num[eéè]ro\s*(\d+)/i);
  if (m) {
    const n = parseInt(m[1] || m[2], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 20) return n;
  }
  // Arabic ordinal markers
  m = title.match(/الفرض\s+(?:ال)?(أ[وl]?[一二三四五六七八九十]?)?(\d+)?/);
  if (m && m[2]) {
    const n = parseInt(m[2], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 20) return n;
  }
  // "الأول" = 1, "الثاني" = 2, "الثالث" = 3
  if (/الفرض الأول|الفرض الاول/i.test(title)) return 1;
  if (/الفرض الثاني/i.test(title)) return 2;
  if (/الفرض الثالث/i.test(title)) return 3;
  return null;
}

// Type detection
function detectType(title: string, hasCorrection: boolean): string {
  // If the file has a "correction" mention but it's primarily a homework/exercise,
  // we don't change the type — we just mark hasCorrection=true. The type stays
  // as the primary content type (homework/exercise) and the corrigé is integrated.
  // We only set type=CORRECTION if the file IS a correction (rare standalone files).
  if (/^(?:corrig[ée]|correction)\b/i.test(title)) return 'CORRECTION';
  if (/^(?:cours|leçon|lesson)\b/i.test(title)) return 'COURSE';
  if (/\bcours\b/i.test(title) && !/s[ée]rie/i.test(title)) return 'COURSE';
  if (/s[ée]rie d'exercices?|s[ée]rie\b/i.test(title)) return 'EXERCISE';
  if (/^tp\b|^\btravaux pratiques?\b/i.test(title)) return 'EXERCISE';
  if (/r[eé]sum[eé]\b/i.test(title)) return 'SUMMARY';
  if (/fiche\b/i.test(title)) return 'CARD';
  if (/concours\b/i.test(title)) return 'BAC_SUBJECT';
  if (/sujet\s*bac|sujets?\s*bac/i.test(title)) return 'BAC_SUBJECT';
  if (/\bexamen\b/i.test(title) && !/contr[oô]le/i.test(title)) return 'EXAM';
  if (/devoir\b/i.test(title) || /فرض|واجب/i.test(title)) return 'DEVOIR';
  if (/exercice\b/i.test(title)) return 'EXERCISE';
  return 'OTHER';
}

// School type detection (Collège pilote, Lycée pilote)
function detectSchoolType(title: string): string {
  if (/coll[èe]ge pilote/i.test(title)) return 'PILOTE';
  if (/lyc[ée]e pilote/i.test(title)) return 'PILOTE';
  if (/pilote/i.test(title)) return 'PILOTE';
  return 'PUBLIC';
}

// Class detection
function detectClass(title: string): string | null {
  // FR: "7ème", "7eme", "7 année", "7e"
  let m = title.match(/(\d+)\s*(?:[èé]me|eme|ème|année|year|annee)\b/i);
  if (m) return mapClassSlug(m[1], false);
  // AR: "السنة السابعة أساسي", "التاسعة أساسي"
  m = title.match(/السنة\s+(?:الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة)/);
  if (m) {
    const arabicToNum: Record<string, number> = {
      'الأولى': 1, 'الثانية': 2, 'الثالثة': 3, 'الرابعة': 4,
      'الخامسة': 5, 'السادسة': 6, 'السابعة': 7, 'الثامنة': 8, 'التاسعة': 9,
    };
    for (const [ar, n] of Object.entries(arabicToNum)) {
      if (m[0].includes(ar)) return mapClassSlug(String(n), true);
    }
  }
  return null;
}

// Language detection
function detectLanguage(title: string): 'fr' | 'ar' | 'fr+ar' {
  const hasFr = /[a-zA-Z]{4,}/.test(title);
  const hasAr = /[\u0600-\u06FF]/.test(title);
  if (hasFr && hasAr) return 'fr+ar';
  if (hasAr) return 'ar';
  return 'fr';
}

// Has correction (corrigé in title)
function detectHasCorrection(title: string): boolean {
  // Matches: "avec correction", "avec corrigé", "et corrigé", "avec sa correction",
  // "corrigé inclus/détaillé/complet", or just the suffix "-corrigé"
  return /(?:avec|et|w\/|[-–—])\s*(?:le\s+|sa\s+)?(?:corrig[ée]|correction)|(?:corrig[ée]|correction)\s+(?:inclus|d[eé]taill[ée]|complet)|avec\s+sa\s+corr/i.test(title);
}

// Product (المنتج) — only meaningful for technologie collège
function detectProduct(title: string): string | null {
  // Match Arabic text after "المنتج" or before/after colon
  const m = title.match(/المنتج\s*[:\s]+([^\(\)\-]+)/);
  if (m) return m[1].trim().substring(0, 200);
  // Or detect common product words
  const productPatterns: RegExp[] = [
    /مطوية/, /عرض/, /ملصق/, /نشرة/, /بطاقة/, /برنامج/, /موقع/, /تطبيق/, /روبوت/, /مجسم/, /لوحة/, /بوستر/,
    /affiche/i, /poster/i, /brochure/i, /d[ée]pliant/i, /maquette/i, /programme/i, /site\s+web/i, /robot/i,
  ];
  for (const re of productPatterns) {
    if (re.test(title)) {
      const m2 = title.match(re);
      if (m2) return m2[0];
    }
  }
  return null;
}

export function parseSiteTitle(rawTitle: string): ParsedTitle {
  // Detect schoolType FIRST (before stripping the "Collège pilote" prefix)
  const schoolType = detectSchoolType(rawTitle);

  // Strip "Collège pilote" / "Lycée pilote" prefix for cleaner parsing
  let title = rawTitle
    .replace(/^Coll[èe]ge pilote\s*[-–—:]\s*/i, '')
    .replace(/^Lyc[ée]e pilote\s*[-–—:]\s*/i, '')
    .replace(/\s*\(\d+\)\s*$/, '') // strip " (2)", " (3)" suffix (duplicates)
    .trim();

  const hasArabic = /[\u0600-\u06FF]/.test(title);
  const hasCorrection = detectHasCorrection(title);
  const type = detectType(title, hasCorrection);
  const subtype = type === 'DEVOIR' ? detectHomeworkSubtype(title) : undefined;
  const number = type === 'DEVOIR' ? detectHomeworkNumber(title) ?? undefined : undefined;
  const trimester = number === 1 ? 'T1' : number === 2 ? 'T2' : number && number >= 3 ? 'T3' : undefined;
  const subjectSlug = detectSubject(title);
  const classSlug = detectClass(title);
  const language = detectLanguage(title);
  const product = (subjectSlug === 'technologie' && classSlug && ['7eme', '8eme', '9eme'].includes(classSlug)) ? detectProduct(title) ?? undefined : undefined;

  return {
    type,
    homeworkSubtype: subtype || undefined,
    homeworkNumber: number,
    trimester,
    schoolType,
    subjectSlug,
    classSlug,
    language,
    product,
    hasArabic,
    hasCorrection,
  };
}

// Test
if (require.main === module) {
  const samples = [
    'Devoir de Contrôle N°1 - Mathématiques - 7ème (2012-2013)',
    'Devoir de Synthèse N°2 - Math - 9ème (2017-2018)',
    'Devoir de Maison N°3 - Physique - 8ème',
    'Cours - Informatique - Guide de programmation scratch - 8ème (2018-2019)',
    'Série d\'exercices - Informatique - 7ème (2013-2014)',
    'Collège pilote - Devoir Contrôle - Math - 9ème (2020-2021)',
    'Devoir Math 7ème avec corrigé détaillé',
    'الفرض الأول - الرياضيات - السابعة أساسي',
  ];
  for (const s of samples) {
    console.log(`\n📄 ${s}`);
    console.log(JSON.stringify(parseSiteTitle(s), null, 2));
  }
}
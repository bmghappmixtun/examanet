/**
 * Données statiques pour le workflow d'ajout de ressources enseignant.
 * Source: Ministère de l'Éducation Tunisien + memories Examanet
 *
 * Années scolaires: du plus ancien au plus récent.
 * Sections par classe: officielles du Ministère.
 * Matières par section: programme officiel.
 */

// ============================================================================
// ANNÉES SCOLAIRES (2015-2016 → 2026-2027, 12 années)
// ============================================================================
export const SCHOOL_YEARS: string[] = (() => {
  const years: string[] = [];
  for (let start = 2015; start <= 2026; start++) {
    years.push(`${start}-${start + 1}`);
  }
  return years;
})();

// ============================================================================
// CLASSES (avec niveau associé)
// ============================================================================
export type ClassSlug = string;
export type SectionSlug = string;
export type SubjectSlug = string;

export interface ClassOption {
  slug: ClassSlug;
  name: string;
  level: 'college' | 'lycee';
}

export const CLASSES: ClassOption[] = [
  // Collège
  { slug: '7eme', name: '7ème année (Collège)', level: 'college' },
  { slug: '8eme', name: '8ème année (Collège)', level: 'college' },
  { slug: '9eme', name: '9ème année (Collège)', level: 'college' },
  // Lycée
  { slug: '1ere-secondaire', name: '1ère année (Lycée)', level: 'lycee' },
  { slug: '2eme-secondaire', name: '2ème année (Lycée)', level: 'lycee' },
  { slug: '3eme-secondaire', name: '3ème année (Lycée)', level: 'lycee' },
  { slug: '4eme-secondaire', name: '4ème année — Bac (Lycée)', level: 'lycee' },
];

// ============================================================================
// SECTIONS PAR CLASSE
// Collège (7-8-9): tronc commun, pas de section
// 1AS: tronc commun, pas de section
// 2AS: 5 sections officielles
// 3AS + 4AS (Bac): 7 sections officielles
// ============================================================================
export const SECTIONS_BY_CLASS: Record<ClassSlug, { slug: SectionSlug; name: string }[]> = {
  // Collège — tronc commun
  '7eme': [],
  '8eme': [],
  '9eme': [],
  // 1AS — tronc commun
  '1ere-secondaire': [],
  // 2AS — 5 sections
  '2eme-secondaire': [
    { slug: 'sciences', name: 'Sciences' },
    { slug: 'technologies-informatique', name: "Technologies de l'Informatique (TI)" },
    { slug: 'eco-services', name: 'Économie et Services' },
    { slug: 'lettres', name: 'Lettres' },
    { slug: 'sport', name: 'Sport' },
  ],
  // 3AS — 7 sections
  '3eme-secondaire': [
    { slug: 'maths', name: 'Mathématiques' },
    { slug: 'sciences', name: 'Sciences Expérimentales' },
    { slug: 'technique', name: 'Sciences Techniques' },
    { slug: 'sciences-informatique', name: "Sciences de l'Informatique" },
    { slug: 'eco-gestion', name: 'Économie et Gestion' },
    { slug: 'lettres', name: 'Lettres' },
    { slug: 'sport', name: 'Sport' },
  ],
  // 4AS (Bac) — 7 sections
  '4eme-secondaire': [
    { slug: 'maths', name: 'Bac Mathématiques' },
    { slug: 'sciences', name: 'Bac Sciences Expérimentales' },
    { slug: 'technique', name: 'Bac Sciences Techniques' },
    { slug: 'sciences-informatique', name: "Bac Sciences de l'Informatique" },
    { slug: 'eco-gestion', name: 'Bac Économie et Gestion' },
    { slug: 'lettres', name: 'Bac Lettres' },
    { slug: 'sport', name: 'Bac Sport' },
  ],
};

export function getSectionsForClass(classSlug: string): { slug: SectionSlug; name: string }[] {
  return SECTIONS_BY_CLASS[classSlug] || [];
}

export function isTroncCommun(classSlug: string): boolean {
  return ['7eme', '8eme', '9eme', '1ere-secondaire'].includes(classSlug);
}

// ============================================================================
// MATIÈRES — Source: Programme Officiel Tunisien (CNP / edunet.tn)
// Filtrées par classe + section
// ============================================================================
export interface SubjectOption {
  slug: SubjectSlug;
  name: string;
  shortName?: string; // Pour affichage compact dans select
}

// Matières communes — enseignées à TOUS les élèves du cycle
const COLLEGE_COMMON: SubjectOption[] = [
  { slug: 'arabe', name: 'Arabe' },
  { slug: 'francais', name: 'Français' },
  { slug: 'anglais', name: 'Anglais' },
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'svt', name: 'Sciences de la Vie et de la Terre (SVT)' },
  { slug: 'physique', name: 'Sciences Physiques' },
  { slug: 'histoire-geographie', name: 'Histoire-Géographie' },
  { slug: 'education-islamique', name: 'Éducation Islamique' },
  { slug: 'education-civique', name: 'Éducation Civique' },
  { slug: 'education-artistique', name: 'Éducation Artistique' },
  { slug: 'technologie', name: 'Technologie' },
  { slug: 'education-musicale', name: 'Éducation Musicale' },
  { slug: 'informatique', name: 'Informatique' },
  { slug: 'sport', name: 'Éducation Physique (Sport)' },
];

const LYCEE_COMMON: SubjectOption[] = [
  { slug: 'arabe', name: 'Arabe' },
  { slug: 'francais', name: 'Français' },
  { slug: 'anglais', name: 'Anglais' },
  { slug: 'histoire-geographie', name: 'Histoire-Géographie' },
  { slug: 'education-islamique', name: 'Éducation Islamique' },
  { slug: 'education-civique', name: 'Éducation Civique' },
  { slug: 'philosophie', name: 'Philosophie' },
  { slug: 'sport', name: 'Éducation Physique (Sport)' },
];

// Matières 1AS (tronc commun lycée)
const LYCEE_1AS: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'svt', name: 'Sciences de la Vie et de la Terre (SVT)' },
  { slug: 'physique', name: 'Sciences Physiques' },
  { slug: 'informatique', name: 'Informatique' },
  { slug: 'technologie', name: 'Technologie' },
  { slug: 'economie', name: 'Économie (intro)' },
];

// 2AS Sciences — Math/Phy/SVT renforcés + Informatique (2h/sem)
const LYCEE_2AS_SCIENCES: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'physique', name: 'Sciences Physiques' },
  { slug: 'svt', name: 'Sciences de la Vie et de la Terre (SVT)' },
  { slug: 'technologie', name: 'Technologie' },
  { slug: 'informatique', name: 'Informatique' },
];

// 2AS Technologies de l'Informatique (TI)
const LYCEE_2AS_TI: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'physique', name: 'Physique (Techno)' },
  { slug: 'technologie', name: 'Technologie (TI)' },
  { slug: 'informatique', name: 'Informatique (TI)' },
];

// 2AS Économie et Services — + Informatique (tableurs, BD, e-commerce)
const LYCEE_2AS_ECO: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques (Éco)' },
  { slug: 'economie', name: 'Économie' },
  { slug: 'gestion', name: 'Gestion' },
  { slug: 'informatique', name: 'Informatique' },
];

// 2AS Lettres — + Informatique (bureautique, traitement de textes)
const LYCEE_2AS_LETTRES: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques (Lettres)' },
  { slug: 'svt', name: 'Sciences de la Vie et de la Terre (Lettres)' },
  { slug: 'informatique', name: 'Informatique' },
];

// 2AS Sport — + Informatique (collecte/analyse données, médias)
const LYCEE_2AS_SPORT: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'svt', name: 'Sciences biologiques' },
  { slug: 'informatique', name: 'Informatique' },
];

// 3AS/4AS — Mathématiques — + Informatique (algo, programmation 2h/sem)
const LYCEE_MATHS: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'physique', name: 'Sciences Physiques' },
  { slug: 'svt', name: 'Sciences de la Vie et de la Terre (SVT)' },
  { slug: 'informatique', name: 'Informatique' },
];

// 3AS/4AS — Sciences Expérimentales — + Informatique (algo, programmation 2h/sem)
const LYCEE_SC_EXP: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'physique', name: 'Sciences Physiques' },
  { slug: 'svt', name: 'Sciences de la Vie et de la Terre (SVT)' },
  { slug: 'informatique', name: 'Informatique' },
];

// 3AS/4AS — Sciences Techniques — + Informatique (algo, programmation 2h/sem)
const LYCEE_TECHNIQUE: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'physique', name: 'Sciences Physiques' },
  { slug: 'technologie', name: 'Technologie (Génie méca/élec)' },
  { slug: 'informatique', name: 'Informatique' },
];

// 3AS/4AS — Sciences de l'Informatique
const LYCEE_SI: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'physique', name: 'Sciences Physiques' },
  { slug: 'informatique', name: 'Informatique' },
  { slug: 'algo-prog', name: 'Algorithme et Programmation' },
  { slug: 'tic', name: "Technologies de l'Information et de la Communication" },
  { slug: 'bases-donnees', name: 'Bases de Données (4AS surtout)' },
  { slug: 'systeme-exploitation-reseaux', name: "Système d'Exploitation et Réseaux" },
];

// 3AS/4AS — Économie et Gestion — + Informatique (gestion info, tableurs, BD 2h/sem)
const LYCEE_ECO: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'economie', name: 'Économie' },
  { slug: 'gestion', name: 'Gestion' },
  { slug: 'informatique', name: 'Informatique' },
];

// 3AS/4AS — Lettres — + Informatique (bureautique, traitement textes 2h/sem)
const LYCEE_LETTRES: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'informatique', name: 'Informatique' },
];

// 3AS/4AS — Sport — + Informatique (collecte données, médias 1h/sem)
const LYCEE_SPORT: SubjectOption[] = [
  ...LYCEE_COMMON,
  { slug: 'mathematiques', name: 'Mathématiques' },
  { slug: 'svt', name: 'Sciences biologiques' },
  { slug: 'informatique', name: 'Informatique' },
];

// Index des matières par (classe, section)
export const SUBJECTS_INDEX: Record<string, SubjectOption[]> = {
  // Collège — toutes les classes ont les mêmes matières (tronc commun)
  '7eme::': COLLEGE_COMMON,
  '8eme::': COLLEGE_COMMON,
  '9eme::': COLLEGE_COMMON,
  // 1AS — tronc commun lycée
  '1ere-secondaire::': LYCEE_1AS,
  // 2AS — 5 sections
  '2eme-secondaire::sciences': LYCEE_2AS_SCIENCES,
  '2eme-secondaire::technologies-informatique': LYCEE_2AS_TI,
  '2eme-secondaire::eco-services': LYCEE_2AS_ECO,
  '2eme-secondaire::lettres': LYCEE_2AS_LETTRES,
  '2eme-secondaire::sport': LYCEE_2AS_SPORT,
  // 3AS — 7 sections
  '3eme-secondaire::maths': LYCEE_MATHS,
  '3eme-secondaire::sciences': LYCEE_SC_EXP,
  '3eme-secondaire::technique': LYCEE_TECHNIQUE,
  '3eme-secondaire::sciences-informatique': LYCEE_SI,
  '3eme-secondaire::eco-gestion': LYCEE_ECO,
  '3eme-secondaire::lettres': LYCEE_LETTRES,
  '3eme-secondaire::sport': LYCEE_SPORT,
  // 4AS — 7 sections (BAC)
  '4eme-secondaire::maths': LYCEE_MATHS,
  '4eme-secondaire::sciences': LYCEE_SC_EXP,
  '4eme-secondaire::technique': LYCEE_TECHNIQUE,
  '4eme-secondaire::sciences-informatique': LYCEE_SI,
  '4eme-secondaire::eco-gestion': LYCEE_ECO,
  '4eme-secondaire::lettres': LYCEE_LETTRES,
  '4eme-secondaire::sport': LYCEE_SPORT,
};

/**
 * Récupère la liste des matières pour une classe et (optionnellement) une section.
 * Si la classe est tronc commun (collège ou 1AS), la section est ignorée.
 */
export function getSubjectsForClassSection(
  classSlug: string,
  sectionSlug: string | null,
): SubjectOption[] {
  // Tronc commun: on ignore la section
  if (isTroncCommun(classSlug) || !sectionSlug) {
    const key = `${classSlug}::`;
    return SUBJECTS_INDEX[key] || [];
  }
  // Lycée avec section
  const key = `${classSlug}::${sectionSlug}`;
  return SUBJECTS_INDEX[key] || [];
}

// ============================================================================
// TYPES DE FICHIERS — 5 choix principaux
// ============================================================================
export type FileTypeKey = 'DEVOIR' | 'EXERCISE' | 'COURSE' | 'REVISION' | 'OTHER';

export interface FileTypeOption {
  key: FileTypeKey;
  label: string;
  icon: string;
  description: string;
  color: string; // tailwind color family
}

export const FILE_TYPES: FileTypeOption[] = [
  {
    key: 'DEVOIR',
    label: 'Devoir',
    icon: '📝',
    description: 'Contrôle, synthèse ou maison',
    color: 'amber',
  },
  {
    key: 'EXERCISE',
    label: "Série d'exercices",
    icon: '✏️',
    description: 'Avec ou sans corrigé',
    color: 'emerald',
  },
  {
    key: 'COURSE',
    label: 'Cours',
    icon: '📚',
    description: 'Leçon, chapitre, fiche',
    color: 'violet',
  },
  {
    key: 'REVISION',
    label: 'Révision',
    icon: '🔄',
    description: 'Bac blanc, rattrapage, fiche',
    color: 'sky',
  },
  {
    key: 'OTHER',
    label: 'Autres',
    icon: '📦',
    description: 'Vous préciserez le type',
    color: 'slate',
  },
];

// Sous-types pour Devoir
export const HOMEWORK_SUBTYPES = [
  { key: 'CONTROLE', label: '📋 Devoir de Contrôle', color: 'red' },
  { key: 'SYNTHESE', label: '📝 Devoir de Synthèse', color: 'violet' },
  { key: 'MAISON', label: '🏠 Devoir de Maison', color: 'orange' },
  { key: 'REVISION', label: '🔄 Devoir de Révision', color: 'blue' },
];

// Numéros de devoir (1 → 6 pour Devoir, 1 → 20 pour Série)
export const HOMEWORK_NUMBERS = Array.from({ length: 6 }, (_, i) => i + 1);
export const EXERCISE_NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);

// ============================================================================
// TYPES D'ÉCOLE
// ============================================================================
export type SchoolType = 'PUBLIC' | 'PRIVATE' | 'PILOTE';

export const SCHOOL_TYPES: {
  key: SchoolType;
  label: string;
  icon: string;
  description: string;
  color: string;
}[] = [
  {
    key: 'PUBLIC',
    label: 'École Publique',
    icon: '🏫',
    description: 'École publique (par défaut)',
    color: 'slate',
  },
  {
    key: 'PRIVATE',
    label: 'École Privée',
    icon: '🏛️',
    description: 'École privée / libre',
    color: 'blue',
  },
  {
    key: 'PILOTE',
    label: 'École Pilote',
    icon: '🎓',
    description: "Lycée/Collège Pilote d'excellence",
    color: 'amber',
  },
];

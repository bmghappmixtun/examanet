/**
 * Extract meta information for Technologie resources:
 * - System name (système étudié) - mandatory for DEVOIR/EXERCISE
 * - Specialty: Génie Mécanique (GM) or Génie Électrique (GE)
 * - Dossier technique presence
 *
 * Used in AiExerciseOverview card to display inline with " | " separators
 */

const TITLE_NOISE = [
  /^n°?\s*\d+\s*(er|eme|ème)?\s*$/i,
  /^(devoir|exercice|série|cours|contrôle|synth[èe]se)\s+(de\s+|n°?\s*\d+)/i,
  /^(technologie|techno|g[ée]nie)/i,
  /^(trim(estre)?)\s*\d+/i,
  /^(1ère?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(2ème?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(3ème?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(4ème?\s*ann[ée]e?\s+secondaire?\s*(bac)?\s*)/i,
  /^(as|2018-2019|2019-2020|2020-2021|2021-2022|2022-2023|2023-2024|2024-2025|2025-2026)$/i,
  /^-?\s*$/,
];

const GM_KEYWORDS = [
  'liaison', 'cinématique', 'cotation', 'engrenage', 'poulie', 'courroie', 'bielle', 'came',
  'matériaux', 'rdm', 'contrainte', 'flexion', 'torsion', 'ajustement', 'tolérance',
  "classe d'équivalence", 'graphe des liaisons', 'fraisage', 'tournage', 'perçage',
  'projection orthogonale'
];

const GE_KEYWORDS = [
  'moteur asynchrone', 'mcc', 'moteur à courant', 'microcontrôleur', 'microcontroleur',
  'mikroc', 'pic 16f', 'a.l.i', 'amplificateur', 'comparateur', 'compteur', 'hacheur',
  'moteur pas-à-pas', 'logique combinatoire', 'logique séquentielle', 'monophasé',
  'triphasé', 'facteur de puissance', '74168', 'ci 74', 'circuit intégré'
];

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

function isValidName(name: string): boolean {
  if (!name || name.length < 4 || name.length > 100) return false;
  for (const noise of TITLE_NOISE) {
    if (noise.test(name)) return false;
  }
  if (!/[a-zA-Zà-ÿÀ-Ÿ]{4,}/.test(name)) return false;
  return true;
}

/**
 * Extract system name from title.
 * Common patterns: "Machine de X", "Poste de X", "Station de X", "Système de X"
 */
export function extractSystemNameFromTitle(title: string): string | null {
  if (!title) return null;

  // Pattern 1: "Technologie: SYSTEME - CLASS"
  const p1 = title.match(/Technologie\s*[:]\s+([^-:]+?)(?:\s*-\s*(?:1AS|2AS|3AS|4AS|1ère|2ème|3ème|4ème|\d)|\s*$)/i);
  if (p1 && isValidName(p1[1])) return cleanName(p1[1]);

  // Pattern 2: "Machine/Poste/Station/Système/Unité de X"
  const systemRegex = /(Machine|Poste|Station|Système|Unité|Dispositif|Montage|Installation|Étau|Banc|Maillet|Presse|Pompe|Vérin|Mécanisme|Convoyeur|Robot)\s+(?:de\s+|d'\s*|d\s+)?([^-:]+?)(?:\s*[-:]\s*(?:\d|\(|$|1ère|2ème|3ème|4ème|1AS|2AS|3AS|4AS|Techno|Technologie|Maths|Mathématiques|Physique|SVT|Français|AR|Arabe|Anglais|Histoire|Géographie|Philo|Informatique|Économie|Sciences|Section|Trim|Profil)|\s*$)/i;
  const p2 = title.match(systemRegex);
  if (p2) {
    const name = (p2[1] + ' ' + p2[2]).trim();
    if (isValidName(name)) {
      if (name.length > 80) return cleanName(name.slice(0, 77) + '...');
      return cleanName(name);
    }
  }

  return null;
}

/**
 * Detect specialty (GM/GE) from title + content.
 */
export function detectSpecialty(title: string, text: string | null): 'GM' | 'GE' | null {
  const titleLower = (title || '').toLowerCase();
  const textLower = (text || '').toLowerCase();

  const gmCount = GM_KEYWORDS.filter(k => titleLower.includes(k) || textLower.includes(k)).length;
  const geCount = GE_KEYWORDS.filter(k => titleLower.includes(k) || textLower.includes(k)).length;

  if (gmCount > geCount && gmCount >= 2) return 'GM';
  if (geCount > gmCount && geCount >= 2) return 'GE';
  return null;
}

export interface TechMeta {
  label: string;
  icon: 'wrench' | 'cog' | 'zap' | 'book' | 'file' | 'flask' | 'atom';
  color: 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'slate';
}

/**
 * Extract the course subject for COURS Technologie files.
 * Patterns:
 * - "Cours - Technologie: SUJET - CLASS"
 * - "Cours - Technologie - SUJET - CLASS"
 * - "Cours - SUJET - Technologie - CLASS"
 * - "Cours - Génie X SUJET" (specialty + subject)
 *
 * Returns the clean subject or null if not extractable.
 */
export function extractCourseSubject(title: string): string | null {
  if (!title) return null;

  // Pattern 1: "Cours - Technologie: SUJET - CLASS" or "Cours - Technologie : SUJET - CLASS"
  const p1 = title.match(/Cours\s*-\s*Technologie\s*[:]\s+([^-:]+?)(?:\s*[-:]\s*(?:\d|1ère|2ème|3ème|4ème|1AS|2AS|3AS|4AS|Technique|Technologies|Sciences|Section|Profil|génie|\(|$)|\s*$)/i);
  if (p1) {
    const subj = cleanName(p1[1]);
    if (isValidName(subj)) return subj;
  }

  // Pattern 2: "Cours - Technologie: SUJET" (no class after)
  const p2 = title.match(/Cours\s*[-:]\s*Technologie\s*[:]\s+(.+?)(?:\s*$|\s*\()/i);
  if (p2) {
    const subj = cleanName(p2[1]);
    if (isValidName(subj) && subj.length < 100) return subj;
  }

  // Pattern 3: "Cours - Génie X SUJET" → strip "Cours - Génie X " and return SUJET
  const p3 = title.match(/Cours\s*-\s*Génie\s+(?:[Mm]écanique|[Éé]lectrique)\s+(.+?)(?:\s*-\s*(?:\d|1ère|2ème|3ème|4ème|1AS|2AS|3AS|4AS|Technique|Technologies|Sciences|Section|Profil|\(|$)|\s*$)/i);
  if (p3) {
    const subj = cleanName(p3[1]);
    if (isValidName(subj) && subj.length < 100) return subj;
  }

  // Pattern 4: "Cours - Technologie: SUJET Leçon N" (handle Leçon/Chapitre)
  const p4 = title.match(/Cours\s*[-:]\s*Technologie\s*[:]\s+(.+?)(?:\s*,?\s*(?:Leçon|Chapitre)\s|\s*$)/i);
  if (p4) {
    const subj = cleanName(p4[1]);
    if (isValidName(subj) && subj.length < 100) return subj;
  }

  return null;
}

/**
 * Build the meta array for the AiExerciseOverview card.
 * Order:
 *   - COURS: course subject (1st) > specialty > dossier
 *   - DEVOIR/EXERCISE: system name (1st) > specialty > dossier
 */
export function buildTechMeta(
  systemName: string | null,
  specialty: 'GM' | 'GE' | null,
  hasDossier: boolean,
  courseSubject: string | null = null
): TechMeta[] {
  const meta: TechMeta[] = [];
  if (courseSubject) {
    // COURS: subject first, with book icon
    meta.push({ label: courseSubject, icon: 'book', color: 'emerald' });
  } else if (systemName) {
    // DEVOIR/EXERCISE: system name first
    meta.push({ label: systemName, icon: 'wrench', color: 'indigo' });
  }
  if (specialty === 'GM') {
    meta.push({ label: 'Génie Mécanique', icon: 'cog', color: 'slate' });
  } else if (specialty === 'GE') {
    meta.push({ label: 'Génie Électrique', icon: 'zap', color: 'amber' });
  }
  if (hasDossier) {
    meta.push({ label: 'Dossier technique', icon: 'file', color: 'sky' });
  }
  return meta;
}

/**
 * One-shot helper: build meta from a resource + content.
 * Uses title (regex) + text (specialty + dossier).
 *
 * For COURS: prefers DB courseSubject (pre-extracted), falls back to title regex,
 * then generalSubject. Order: courseSubject > specialty > dossier.
 * For DEVOIR/EXERCISE: extracts system name from title.
 * Order: systemName > specialty > dossier.
 */
export function getTechMeta(
  title: string,
  text: string | null,
  savedSystemName: string | null = null,
  options?: {
    isCourse?: boolean;
    courseSubject?: string | null;
    generalSubject?: string | null;
  }
): TechMeta[] {
  // For COURS: prefer the DB courseSubject, fall back to title regex, then generalSubject
  let courseSubject: string | null = null;
  if (options?.isCourse) {
    courseSubject = options.courseSubject?.trim() || extractCourseSubject(title);
    // Final fallback to generalSubject if nothing else worked
    if (!courseSubject && options.generalSubject) {
      courseSubject = cleanName(options.generalSubject);
      if (courseSubject.length > 80) {
        courseSubject = courseSubject.slice(0, 77) + '...';
      }
    }
  }

  // For DEVOIR/EXERCISE: extract system name
  const systemName = options?.isCourse
    ? null
    : (savedSystemName || extractSystemNameFromTitle(title));

  const specialty = detectSpecialty(title, text);
  const hasDossier = text ? /dossier\s+technique/i.test(text) : false;
  return buildTechMeta(systemName, specialty, hasDossier, courseSubject);
}

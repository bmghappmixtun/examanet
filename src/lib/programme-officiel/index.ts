/**
 * Programme Officiel Tunisien
 *
 * Module d'accès aux données du programme officiel de l'enseignement
 * tunisien (collège + lycée, 7 niveaux).
 *
 * Source: edunet.tn, cnp.com.tn, bac.com.tn
 */

import dataJson from './data.json';
import type { ProgrammeOfficiel, Level, Subject, Section } from './types';

export const programmeOfficiel = dataJson as unknown as ProgrammeOfficiel;

export type { ProgrammeOfficiel, Level, Subject, Section };

/**
 * Trouve un niveau par sa clé
 */
export function getLevel(key: string): Level | undefined {
  return programmeOfficiel.levels.find((l) => l.key === key);
}

/**
 * Trouve une matière dans un niveau
 */
export function getSubject(levelKey: string, subjectSlug: string): Subject | undefined {
  const level = getLevel(levelKey);
  if (!level) return undefined;
  return level.subjects.find((s) => s.slug === subjectSlug);
}

/**
 * Liste des niveaux qui ont des sections
 */
export function getLevelsWithSections(): Level[] {
  return programmeOfficiel.levels.filter((l) => l.sections && l.sections.length > 0);
}

/**
 * Liste des niveaux sans sections (collège, 1AS)
 */
export function getLevelsWithoutSections(): Level[] {
  return programmeOfficiel.levels.filter((l) => !l.sections || l.sections.length === 0);
}

/**
 * Liste de tous les slugs de matières
 */
export function getAllSubjectSlugs(): string[] {
  const slugs = new Set<string>();
  programmeOfficiel.levels.forEach((level) => {
    level.subjects.forEach((s) => slugs.add(s.slug));
  });
  return Array.from(slugs);
}

/**
 * Compteur de leçons par niveau
 */
export function getLevelStats(level: Level): {
  totalSubjects: number;
  totalLessons: number;
  totalThemes: number;
  sections: number;
} {
  let totalLessons = 0;
  let totalThemes = 0;

  const countContent = (data: any): void => {
    if (data.trimestre1) totalLessons += data.trimestre1.length;
    if (data.trimestre2) totalLessons += data.trimestre2.length;
    if (data.trimestre3) totalLessons += data.trimestre3.length;
    if (data.t1) totalLessons += data.t1.length;
    if (data.t2) totalLessons += data.t2.length;
    if (data.t3) totalLessons += data.t3.length;
    if (data.themes) totalThemes += data.themes.length;
    if (data.sections) {
      Object.values(data.sections).forEach((sec: any) => countContent(sec));
    }
  };

  level.subjects.forEach((s) => countContent(s.data));

  return {
    totalSubjects: level.subjects.length,
    totalLessons,
    totalThemes,
    sections: level.sections?.length || 0,
  };
}

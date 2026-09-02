/**
 * Types pour le Programme Officiel Tunisien
 */

export type SubjectSlug =
  | 'mathematiques'
  | 'physique'
  | 'svt'
  | 'technologie'
  | 'informatique'
  | 'anglais'
  | 'francais'
  | 'arabe'
  | 'philosophie'
  | 'histoire-geographie'
  | 'education-islamique'
  | 'economie'
  | 'gestion';

export type LevelKey = '7eme' | '8eme' | '9eme' | '1AS' | '2AS' | '3AS' | '4AS';

export type SubjectLanguage = 'fr' | 'ar' | 'en';

export interface Section {
  key: string;
  nameFr: string;
  nameAr: string;
  icon: string;
}

export interface Theme {
  theme: string;
  duree?: string;
  content?: string;
}

export interface TrimestreData {
  trimestre1?: string[];
  trimestre2?: string[];
  trimestre3?: string[];
  t1?: string[];
  t2?: string[];
  t3?: string[];
  themes?: Theme[];
  sections?: Record<string, TrimestreData>;
  nameFr?: string;
  nameAr?: string;
}

export interface Subject {
  slug: SubjectSlug;
  name: string;
  nameAr: string;
  lang: SubjectLanguage;
  taughtIn: string[];
  data: TrimestreData;
}

export interface Level {
  key: LevelKey;
  title: string;
  subtitle: string;
  num: number;
  sections?: Section[];
  subjects: Subject[];
}

export interface ProgrammeOfficiel {
  levels: Level[];
}

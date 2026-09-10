import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

export function formatDate(date: Date | string, lang: 'fr' | 'ar' = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (lang === 'ar') {
    return d.toLocaleDateString('ar-TN', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function timeAgo(date: Date | string | number | null | undefined): string {
  if (date == null || date === 0 || date === '') return 'jamais';
  let d: Date;
  if (typeof date === 'number') {
    d = new Date(date);
  } else if (typeof date === 'string' && /^\d+$/.test(date)) {
    d = new Date(Number(date));
  } else if (typeof date === 'string') {
    d = new Date(date);
  } else {
    d = date;
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) return 'inconnu';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  const intervals: [number, string][] = [
    [31536000, 'an'],
    [2592000, 'mois'],
    [86400, 'jour'],
    [3600, 'heure'],
    [60, 'minute'],
  ];
  for (const [secs, label] of intervals) {
    const interval = Math.floor(seconds / secs);
    if (interval >= 1) {
      return `il y a ${interval} ${label}${interval > 1 ? 's' : ''}`;
    }
  }
  return "à l'instant";
}

// Re-export the proper slugify from @/lib/slugify for backwards compatibility
export { properSlugify as slugify, properSlugify, decodeHtmlEntities } from './slugify';

export function fileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

export const RESOURCE_TYPE_LABELS: Record<string, { fr: string; ar: string; color: string }> = {
  COURSE: { fr: 'Cours', ar: 'درس', color: 'bg-blue-100 text-blue-700' },
  DEVOIR: { fr: 'Devoir', ar: 'فرض', color: 'bg-amber-100 text-amber-700' },
  EXERCISE: { fr: "Série d'exercices", ar: 'سلسلة تمارين', color: 'bg-green-100 text-green-700' },
  REVISION: { fr: 'Révision', ar: 'مراجعة', color: 'bg-purple-100 text-purple-700' },
  EXAM: { fr: 'Contrôle/Examen', ar: 'اختبار', color: 'bg-red-100 text-red-700' },
  BAC_SUBJECT: { fr: 'Sujet Bac', ar: 'موضوع باك', color: 'bg-pink-100 text-pink-700' },
  CORRECTION: { fr: 'Corrigé', ar: 'تصحيح', color: 'bg-emerald-100 text-emerald-700' },
  SUMMARY: { fr: 'Résumé', ar: 'ملخص', color: 'bg-indigo-100 text-indigo-700' },
  OTHER: { fr: 'Autre', ar: 'آخر', color: 'bg-slate-100 text-slate-700' },
};

// Homework subtype — only relevant when type=DEVOIR
export const HOMEWORK_SUBTYPE_LABELS: Record<string, { fr: string; ar: string; color: string }> = {
  CONTROL: { fr: 'Contrôle', ar: 'فرض مراقبة', color: 'bg-red-100 text-red-700' },
  SYNTHESIS: { fr: 'Synthèse', ar: 'فرض تأليفي', color: 'bg-violet-100 text-violet-700' },
  HOUSEWORK: { fr: 'Maison', ar: 'واجب منزلي', color: 'bg-orange-100 text-orange-700' },
};

export const GOVERNORATES = [
  'Tunis',
  'Ariana',
  'Ben Arous',
  'Manouba',
  'Nabeul',
  'Zaghouan',
  'Bizerte',
  'Béja',
  'Jendouba',
  'Kef',
  'Siliana',
  'Sousse',
  'Monastir',
  'Mahdia',
  'Sfax',
  'Kairouan',
  'Kasserine',
  'Sidi Bouzid',
  'Gabès',
  'Medenine',
  'Tataouine',
  'Gafsa',
  'Tozeur',
  'Kebili',
];

// 2026-09-10: Teacher name helpers.
// DB has 4 fields: firstName/lastName (FR) and firstNameAr/lastNameAr (AR).
// Many teachers have AR in lastNameAr only (firstNameAr is null) — the previous
// pattern `{t.firstNameAr && (...)}` hid the AR name for them. These helpers
// build the display name robustly from any non-empty FR or AR field.
type TeacherLike = {
  firstName?: string | null;
  lastName?: string | null;
  firstNameAr?: string | null;
  lastNameAr?: string | null;
};

function joinNonEmpty(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').trim();
}

export function teacherNameFr(t: TeacherLike | null | undefined, fallback = 'Professeur'): string {
  if (!t) return fallback;
  return joinNonEmpty(t.firstName, t.lastName)
    || joinNonEmpty(t.firstNameAr, t.lastNameAr)
    || fallback;
}

export function teacherNameAr(t: TeacherLike | null | undefined): string {
  if (!t) return '';
  return joinNonEmpty(t.firstNameAr, t.lastNameAr);
}

export function teacherInitials(t: TeacherLike | null | undefined): string {
  const name = teacherNameFr(t, '');
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'P';
}


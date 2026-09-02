/**
 * Concours 9ème année — data layer
 *
 * Source-of-truth for ALL Concours 9ème data on the site.
 * The pillar page, the /sujets-passes sub-page, and any future
 * "concours 9ème" components MUST read from this file.
 *
 * ARCHITECTURE: 
 * - The manifest is embedded at build time (scripts/embed-concours-manifest.ts)
 * - This avoids fs.readFileSync which doesn't work on CF Workers runtime
 * - For client components, use the same data via /data/concours-9eme-manifest.json
 *
 * @see /public/data/concours-9eme-manifest.json
 * @see /src/data/concours-9eme-manifest.ts (auto-generated)
 */

import { CONCOURS_9EME_MANIFEST } from '@/data/concours-9eme-manifest';

export type ConcoursFile = {
  key: string;
  url: string;
  size: number;
  source?: '9web.edunet.tn' | '9raya.tn' | 'ecoles.com.tn' | string;
  namespace?: 'officials' | '9raya' | string;
  note?: string;
};

export type ConcourStats = {
  totalFiles: number;
  totalSujets: number;
  totalCorriges: number;
  totalCorriges2020Plus: number;
  years: number[];
  yearsAvailable: string[];
  voies: Array<'general' | 'technique'>;
  sources: Array<{ name: string; count: number }>;
  gold2020Corrige: ConcoursFile | null;
};

export type ConcourSubject = {
  slug: string;
  nameFr: string;
  nameAr: string;
  icon: string;
  color: string;
  bgColor: string;
  descFr: string;
};

export const CONCOURS_SUBJECTS: ConcourSubject[] = [
  {
    slug: 'math',
    nameFr: 'Mathématiques',
    nameAr: 'الرياضيات',
    icon: '📐',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    descFr: 'Algèbre, géométrie, fonctions, statistiques',
  },
  {
    slug: 'arabe',
    nameFr: 'Arabe',
    nameAr: 'العربية',
    icon: '📚',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    descFr: 'قواعد، بلاغة، تعبير، قراءة',
  },
  {
    slug: 'francais',
    nameFr: 'Français',
    nameAr: 'الفرنسية',
    icon: '📖',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    descFr: 'Grammaire, conjugaison, rédaction, lecture',
  },
  {
    slug: 'svt',
    nameFr: 'Sciences de la Vie et de la Terre',
    nameAr: 'علوم الحياة والأرض',
    icon: '🧬',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    descFr: 'Biologie, géologie, écologie',
  },
  {
    slug: 'physique',
    nameFr: 'Physique',
    nameAr: 'علوم فيزيائية',
    icon: '⚛️',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    descFr: 'Mécanique, électricité, optique',
  },
  {
    slug: 'anglais',
    nameFr: 'Anglais',
    nameAr: 'الإنجليزية',
    icon: '🌍',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    descFr: 'Grammar, vocabulary, comprehension',
  },
  {
    slug: 'histoire',
    nameFr: 'Histoire-Géographie',
    nameAr: 'التاريخ والجغرافيا',
    icon: '🏛️',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    descFr: 'Histoire, géographie, éducation civique',
  },
];

export const CONCOURS_VOIES = [
  {
    slug: 'general',
    nameFr: 'Voie Générale',
    nameAr: 'العام',
    icon: '🎓',
    color: 'text-indigo-600',
  },
  {
    slug: 'technique',
    nameFr: 'Voie Technique',
    nameAr: 'التقني',
    icon: '🔧',
    color: 'text-orange-600',
  },
] as const;

// Load the embedded manifest (synchronous, works on both Vercel and CF Workers)
function loadManifest(): any {
  return CONCOURS_9EME_MANIFEST;
}

/**
 * Build a proxied URL for the given key, so the browser only ever sees
 * examanet.com URLs (never the Vercel Blob storage URL).
 */
export function proxiedFileUrl(key: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `/api/concours-file/${encoded}`;
}

/**
 * Returns files with the ORIGINAL upstream URLs (used by the proxy route itself).
 */
export function getOriginalConcoursFiles(): ConcoursFile[] {
  const m = loadManifest();
  return (m.uploaded || []).map((u: any) => ({
    key: u.key,
    url: u.url,
    size: u.size,
    source: u.source,
    namespace: u.namespace,
    note: u.note,
  }));
}

export function getConcours9emeFiles(): ConcoursFile[] {
  const m = loadManifest();
  return (m.uploaded || []).map((u: any) => ({
    key: u.key,
    url: proxiedFileUrl(u.key),
    size: u.size,
    source: u.source,
    namespace: u.namespace,
    note: u.note,
  }));
}

export function getCorriges(): ConcoursFile[] {
  return getConcours9emeFiles().filter((f) => {
    const parts = f.key.split('/');
    const type = parts[4] || '';
    return type.includes('corrig') || type.includes('correction');
  });
}

export function getCorriges2020Plus(): ConcoursFile[] {
  return getCorriges().filter((f) => {
    const parts = f.key.split('/');
    const year = parseInt(parts[2] || '0', 10);
    return year >= 2020;
  });
}

export type YearGroup = {
  year: number;
  voies: {
    [voie: string]: {
      [subject: string]: {
        sujet?: ConcoursFile;
        corrige?: ConcoursFile;
        sujetPlusCorrige?: ConcoursFile;
      };
    };
  };
};

export function groupByYear(): YearGroup[] {
  const files = getConcours9emeFiles();
  const grouped: Record<number, YearGroup> = {};
  for (const f of files) {
    const parts = f.key.split('/');
    const year = parseInt(parts[2] || '0', 10);
    const voie = parts[3] || 'general';
    const type = parts[4] || 'sujets';
    const subject = (parts[5] || '')
      .replace('.pdf', '')
      .replace(/-modele-\d+$/, '')
      .replace(/-trial$/, '');

    if (!grouped[year]) grouped[year] = { year, voies: {} };
    if (!grouped[year].voies[voie]) grouped[year].voies[voie] = {};
    if (!grouped[year].voies[voie][subject]) grouped[year].voies[voie][subject] = {};

    if (type.includes('corrig') || type.includes('correction')) {
      if (type.includes('sujets+')) {
        grouped[year].voies[voie][subject].sujetPlusCorrige = f;
      } else {
        grouped[year].voies[voie][subject].corrige = f;
      }
    } else {
      grouped[year].voies[voie][subject].sujet = f;
    }
  }
  return Object.values(grouped).sort((a, b) => b.year - a.year);
}

export function getConcoursStats(): ConcourStats {
  const files = getConcours9emeFiles();
  const corriges2020Plus = getCorriges2020Plus();
  const allCorriges = getCorriges();

  const sourcesMap: Record<string, number> = {};
  for (const f of files) {
    if (f.source) sourcesMap[f.source] = (sourcesMap[f.source] || 0) + 1;
  }

  const years = Array.from(new Set(files.map((f) => parseInt(f.key.split('/')[2] || '0', 10))))
    .filter((y) => y > 0)
    .sort((a, b) => a - b);

  return {
    totalFiles: files.length,
    totalSujets: files.length - allCorriges.length,
    totalCorriges: allCorriges.length,
    totalCorriges2020Plus: corriges2020Plus.length,
    years,
    yearsAvailable: years.map(String),
    voies: ['general', 'technique'],
    sources: Object.entries(sourcesMap).map(([name, count]) => ({ name, count })),
    gold2020Corrige: corriges2020Plus[0] || null,
  };
}

export function getSubjectMeta(slug: string): ConcourSubject | null {
  return CONCOURS_SUBJECTS.find((s) => s.slug === slug) || null;
}

export function getUpcomingCorriges(): Array<{
  year: number;
  subject: string;
  status: 'placeholder';
}> {
  const placeholders: Array<{ year: number; subject: string; status: 'placeholder' }> = [];
  const recentYears = [2026, 2025, 2024, 2023, 2022, 2021, 2020];
  const coreSubjects = ['math', 'francais', 'arabe', 'svt', 'physique', 'anglais'];

  for (const year of recentYears) {
    for (const subject of coreSubjects) {
      const hasCorrige = getCorriges2020Plus().some((f) => {
        const parts = f.key.split('/');
        return parseInt(parts[2], 10) === year && (parts[5] || '').startsWith(subject);
      });
      if (!hasCorrige) {
        placeholders.push({ year, subject, status: 'placeholder' });
      }
    }
  }
  return placeholders.slice(0, 6);
}

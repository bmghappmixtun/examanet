/**
 * Baccalauréat data layer
 *
 * Source-of-truth for ALL Bac data on the site.
 * The pillar page, the /archives sub-page, and any future
 * "bac" components MUST read from this file.
 *
 * ARCHITECTURE (future-proof):
 * - `getBacFiles()` reads the static manifest from /public/data
 * - Adding new PDFs = upload to Blob + update bac-manifest.json + redeploy
 * - Manifest key convention: `bac/officials/{year}/{section}/{session}/{type}/{subject}.pdf`
 *   - year: 2010+
 *   - section: math | sc-exp | sc-tech | sc-info | eco-gestion | lettres | sport
 *   - session: principale | controle
 *   - type: sujets | corriges
 *   - subject: math | physique | svt | arabe | francais | anglais | philo | histoire-geo | economie | gestion | informatique | tech | eps
 *
 * For client components, use the same fetch URL via /data/bac-manifest.json
 * Server components can call the helpers below directly.
 *
 * @see /public/data/bac-manifest.json
 */

import { BAC_MANIFEST } from '@/data/bac-manifest';

const BLOB_BASE_URL = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com';

export type BacFile = {
  key: string;
  url: string;
  size: number;
  source?: '9web.edunet.tn' | 'bac.org.tn' | 'ecoles.com.tn' | string;
  namespace?: 'officials' | string;
  year?: number;
  section?: string;
  session?: 'principale' | 'controle';
  type?: 'sujets' | 'corriges';
  subject?: string;
  note?: string;
};

export type BacSection = {
  slug: string;
  nameFr: string;
  nameAr: string;
  icon: string;
  color: string;
};

export type BacSubject = {
  slug: string;
  nameFr: string;
  nameAr: string;
  icon: string;
};

// =============================================================================
// STATIC CONFIG — sections + subjects (these don't change with uploads)
// =============================================================================
export const BAC_SECTIONS: BacSection[] = [
  { slug: 'math', nameFr: 'Mathématiques', nameAr: 'الرياضيات', icon: '📐', color: 'blue' },
  {
    slug: 'sc-exp',
    nameFr: 'Sciences Expérimentales',
    nameAr: 'العلوم التجريبية',
    icon: '🧪',
    color: 'emerald',
  },
  {
    slug: 'sc-tech',
    nameFr: 'Sciences Techniques',
    nameAr: 'العلوم التقنية',
    icon: '⚙️',
    color: 'slate',
  },
  {
    slug: 'sc-info',
    nameFr: 'Sciences Informatiques',
    nameAr: 'علوم الإعلامية',
    icon: '💻',
    color: 'indigo',
  },
  {
    slug: 'eco-gestion',
    nameFr: 'Économie et Gestion',
    nameAr: 'الاقتصاد والتصرف',
    icon: '💼',
    color: 'amber',
  },
  { slug: 'lettres', nameFr: 'Lettres', nameAr: 'الآداب', icon: '📚', color: 'purple' },
  { slug: 'sport', nameFr: 'Sport', nameAr: 'الرياضة', icon: '⚽', color: 'orange' },
];

export const BAC_SUBJECTS: BacSubject[] = [
  { slug: 'math', nameFr: 'Mathématiques', nameAr: 'الرياضيات', icon: '📐' },
  { slug: 'physique', nameFr: 'Sciences Physiques', nameAr: 'العلوم الفيزيائية', icon: '⚛️' },
  {
    slug: 'svt',
    nameFr: 'Sciences de la Vie et de la Terre',
    nameAr: 'علوم الحياة والأرض',
    icon: '🧬',
  },
  { slug: 'arabe', nameFr: 'Arabe', nameAr: 'العربية', icon: '📖' },
  { slug: 'francais', nameFr: 'Français', nameAr: 'الفرنسية', icon: '📕' },
  { slug: 'anglais', nameFr: 'Anglais', nameAr: 'الإنجليزية', icon: '🌍' },
  { slug: 'philo', nameFr: 'Philosophie', nameAr: 'الفلسفة', icon: '💭' },
  { slug: 'histoire-geo', nameFr: 'Histoire-Géographie', nameAr: 'التاريخ والجغرافيا', icon: '🏛️' },
  { slug: 'economie', nameFr: 'Économie', nameAr: 'الاقتصاد', icon: '📈' },
  { slug: 'gestion', nameFr: 'Gestion', nameAr: 'التصرف', icon: '📊' },
  { slug: 'informatique', nameFr: 'Informatique', nameAr: 'الإعلامية', icon: '🖥️' },
  { slug: 'tech', nameFr: 'Technologie', nameAr: 'التكنولوجيا', icon: '🔧' },
  { slug: 'eps', nameFr: 'Éducation Physique', nameAr: 'التربية البدنية', icon: '⚽' },
];

// =============================================================================
// MANIFEST LOADER
// Uses the embedded BAC_MANIFEST (works on both Vercel and CF Workers).
// =============================================================================
function loadManifest(): any {
  return BAC_MANIFEST;
}

// =============================================================================
// KEY PARSER — extracts year/section/session/type/subject from key path
// =============================================================================
function parseKey(
  key: string,
): { year: number; section: string; session: string; type: string; subject: string } | null {
  // bac/officials/{year}/{section}/{session}/{type}/{subject}.pdf
  const match = key.match(/^bac\/([^/]+)\/(\d{4})\/([^/]+)\/([^/]+)\/([^/]+)\/([^/.]+)\.pdf$/);
  if (!match) return null;
  return {
    year: parseInt(match[2], 10),
    section: match[3],
    session: match[4],
    type: match[5],
    subject: match[6],
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Build a proxied URL for the given key, so the browser only ever sees
 * examanet.com URLs (never the Vercel Blob storage URL).
 */
export function proxiedBacFileUrl(key: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `/api/concours-file/${encoded}`;
}

/**
 * Returns files with ORIGINAL upstream URLs (used by the proxy route itself,
 * since it needs the real blob URL, not its own proxy URL).
 */
export function getOriginalBacFiles(): BacFile[] {
  const manifest = loadManifest();
  return (manifest.uploaded || []).map((f: any) => {
    const parsed = parseKey(f.key);
    return {
      ...f,
      year: parsed?.year,
      section: parsed?.section,
      session: parsed?.session,
      type: parsed?.type,
      subject: parsed?.subject,
    };
  });
}

export function getBacFiles(): BacFile[] {
  const manifest = loadManifest();
  return (manifest.uploaded || []).map((f: any) => {
    const parsed = parseKey(f.key);
    return {
      ...f,
      // Replace the upstream blob URL with our proxy URL (browser sees examanet.com)
      url: proxiedBacFileUrl(f.key),
      year: parsed?.year,
      section: parsed?.section,
      session: parsed?.session,
      type: parsed?.type,
      subject: parsed?.subject,
    };
  });
}

export type BacStats = {
  totalFiles: number;
  totalSujets: number;
  totalCorriges: number;
  yearRange: { min: number; max: number } | null;
  sectionsCount: number;
  subjectsCount: number;
  yearsWithFiles: number[];
  byYear: Record<number, number>;
  bySection: Record<string, number>;
  bySubject: Record<string, number>;
};

export function getBacStats(): BacStats {
  const files = getBacFiles();
  const sujets = files.filter((f) => f.type === 'sujets');
  const corriges = files.filter((f) => f.type === 'corriges');

  const years = files.map((f) => f.year).filter((y): y is number => typeof y === 'number');
  const minYear = years.length > 0 ? Math.min(...years) : null;
  const maxYear = years.length > 0 ? Math.max(...years) : null;

  const byYear: Record<number, number> = {};
  const bySection: Record<string, number> = {};
  const bySubject: Record<string, number> = {};
  for (const f of files) {
    if (f.year) byYear[f.year] = (byYear[f.year] || 0) + 1;
    if (f.section) bySection[f.section] = (bySection[f.section] || 0) + 1;
    if (f.subject) bySubject[f.subject] = (bySubject[f.subject] || 0) + 1;
  }

  return {
    totalFiles: files.length,
    totalSujets: sujets.length,
    totalCorriges: corriges.length,
    yearRange: minYear !== null && maxYear !== null ? { min: minYear, max: maxYear } : null,
    sectionsCount: Object.keys(bySection).length,
    subjectsCount: Object.keys(bySubject).length,
    yearsWithFiles: Object.keys(byYear)
      .map(Number)
      .sort((a, b) => b - a),
    byYear,
    bySection,
    bySubject,
  };
}

export function getFilesByYear(year: number): BacFile[] {
  return getBacFiles().filter((f) => f.year === year);
}

export function getFilesBySection(section: string): BacFile[] {
  return getBacFiles().filter((f) => f.section === section);
}

export function getFilesByYearAndSection(year: number, section: string): BacFile[] {
  return getBacFiles().filter((f) => f.year === year && f.section === section);
}

export type YearGroup = {
  year: number;
  total: number;
  sujets: number;
  corriges: number;
  files: BacFile[];
};

export function groupByYear(): YearGroup[] {
  const files = getBacFiles();
  const grouped: Record<number, BacFile[]> = {};
  for (const f of files) {
    if (typeof f.year === 'number') {
      if (!grouped[f.year]) grouped[f.year] = [];
      grouped[f.year].push(f);
    }
  }
  return Object.entries(grouped)
    .map(([year, files]) => ({
      year: parseInt(year, 10),
      total: files.length,
      sujets: files.filter((f) => f.type === 'sujets').length,
      corriges: files.filter((f) => f.type === 'corriges').length,
      files,
    }))
    .sort((a, b) => b.year - a.year);
}

export type SectionGroup = {
  section: string;
  meta: BacSection | null;
  total: number;
  sujets: number;
  corriges: number;
  years: number[];
};

export function groupBySection(): SectionGroup[] {
  const files = getBacFiles();
  const grouped: Record<string, BacFile[]> = {};
  for (const f of files) {
    if (f.section) {
      if (!grouped[f.section]) grouped[f.section] = [];
      grouped[f.section].push(f);
    }
  }
  return BAC_SECTIONS.map((meta) => {
    const sectionFiles = grouped[meta.slug] || [];
    return {
      section: meta.slug,
      meta,
      total: sectionFiles.length,
      sujets: sectionFiles.filter((f) => f.type === 'sujets').length,
      corriges: sectionFiles.filter((f) => f.type === 'corriges').length,
      years: [
        ...new Set(
          sectionFiles.map((f) => f.year).filter((y): y is number => typeof y === 'number'),
        ),
      ].sort((a, b) => b - a),
    };
  });
}

// =============================================================================
// ARCHIVE-SPECIFIC GROUPING (used by /bac/archives)
// Structure: year → section → session → BacFile[]
// =============================================================================
export type ArchiveYearGroup = {
  year: number;
  total: number;
  sujets: number;
  corriges: number;
  sections: {
    [sectionSlug: string]: {
      [sessionCode: string]: BacFile[]; // sessionCode: 'principale' | 'controle'
    };
  };
};

export function groupByYearForArchive(): ArchiveYearGroup[] {
  const files = getBacFiles();
  const grouped: Record<number, ArchiveYearGroup> = {};

  for (const f of files) {
    if (typeof f.year !== 'number' || !f.section || !f.session) continue;
    if (!grouped[f.year]) {
      grouped[f.year] = { year: f.year, total: 0, sujets: 0, corriges: 0, sections: {} };
    }
    const yg = grouped[f.year];
    if (!yg.sections[f.section]) yg.sections[f.section] = {};
    if (!yg.sections[f.section][f.session]) yg.sections[f.section][f.session] = [];
    yg.sections[f.section][f.session].push(f);
    yg.total++;
    if (f.type === 'sujets') yg.sujets++;
    if (f.type === 'corriges') yg.corriges++;
  }

  return Object.values(grouped).sort((a, b) => b.year - a.year);
}

export function getSectionMeta(slug: string): BacSection | null {
  return BAC_SECTIONS.find((s) => s.slug === slug) || null;
}

export function getSubjectMeta(slug: string): BacSubject | null {
  return BAC_SUBJECTS.find((s) => s.slug === slug) || null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

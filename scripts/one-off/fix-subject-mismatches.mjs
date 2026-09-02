/**
 * fix-subject-mismatches.mjs
 *
 * Fix REAL subject mismatches.
 *
 * Targets (clear bugs, no ambiguity):
 * - 452 cases: title says "Physique"/"Sciences physiques" but subject=mathematiques
 * - 46 cases: title says "SVT" but subject=mathematiques
 * - 29 cases: title says "Géographie" but subject=histoire
 * - 13 cases: title says "Économie" but subject=informatique
 * - 2 cases: title says "Math" but subject=informatique (or others)
 *
 * Skipped (design decision needed):
 * - Informatique subtopics (algo-prog, tic, bases-donnees) — keep as-is (teacher choice)
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const all = await p.resource.findMany({
  where: { status: 'PUBLISHED' },
  select: { id: true, title: true, subject: { select: { slug: true } } }
});

console.log(`Loaded ${all.length} resources`);

// Get all subject IDs
const subjectMap = {};
const subjects = await p.subject.findMany();
for (const s of subjects) subjectMap[s.slug] = s.id;
console.log(`Found ${Object.keys(subjectMap).length} subjects`);

function detectExpectedSubject(title) {
  const t = title.toLowerCase();

  // Order matters — most specific first
  if (/svt|sciences?\s*de\s*la\s*vie|علوم\s*الحياة/.test(t)) return 'svt';
  if (/sciences?\s*physiques|فيزياء/.test(t)) return 'physique';
  if (/\bphysique\b/.test(t) && !/physique\s*-\s*chimie/.test(t)) return 'physique';
  if (/physique.*chimie|chimie.*physique/.test(t)) return 'physique';
  if (/math[ée]matiques?|math\b|رياضيات/.test(t) && !/math\s*exp/.test(t)) return 'mathematiques';
  if (/fran[çc]ais|فرنسية/.test(t)) return 'francais';
  if (/\barabe\b|عربية/.test(t)) return 'arabe';
  if (/anglais|إنجليزية/.test(t)) return 'anglais';
  if (/\bg[ée]ographie\b|جغرافيا/.test(t)) return 'geographie';
  if (/histoire.*g[ée]ographie|h[ie]stoire-g[ée]ographie/.test(t)) return 'histoire-geographie';
  if (/\bhistoire\b|تاريخ/.test(t)) return 'histoire';
  if (/philosophie|فلسفة/.test(t)) return 'philosophie';
  if (/[ée]conomie|اقتصاد/.test(t)) return 'economie';
  if (/technologie|تكنولوجيا/.test(t)) return 'technologie';
  if (/musique|موسيقى/.test(t)) return 'musique';
  if (/th[éeE]âtre|مسرحي/.test(t)) return 'theatre';
  if (/arts?\s*plastiques?|رسم/.test(t)) return 'arts-plastiques';
  if (/[ée]ducation\s*islamique|اسلامية|إسلامية/.test(t)) return 'education-islamique';
  if (/[ée]ducation\s*civique|مدنية/.test(t)) return 'education-civique';
  if (/gestion\b/.test(t)) return 'gestion';
  if (/sport\b/.test(t)) return 'sport';
  if (/pens[ée]e\s*islamique/.test(t)) return 'pensee-islamique';
  if (/3[èe]me\s*langue/.test(t)) return '3eme-langue';

  return null;
}

const stats = {
  physique: 0,
  svt: 0,
  geographie: 0,
  francais: 0,
  arabe: 0,
  anglais: 0,
  histoire: 0,
  philosophie: 0,
  economie: 0,
  technologie: 0,
  musique: 0,
  theatre: 0,
  educationIslamique: 0,
  educationCivique: 0,
  gestion: 0,
  sport: 0,
  histoireGeo: 0,
  troisiemeLangue: 0,
  penseeIslamique: 0,
  unchanged: 0,
  skipAmbiguous: 0,
};

let batch = [];
const BATCH_SIZE = 100;

for (const r of all) {
  if (!r.title) continue;
  const expected = detectExpectedSubject(r.title);
  if (!expected) {
    stats.unchanged++;
    continue;
  }
  const actual = r.subject?.slug;
  if (expected === actual) {
    stats.unchanged++;
    continue;
  }

  // Skip if the change is to a subtopic (informatique algo-prog, tic, etc.)
  // These are design decisions, not bugs
  if (expected === 'informatique' && ['algo-prog', 'tic', 'bases-donnees', 'systeme-exploitation-reseaux'].includes(actual)) {
    stats.skipAmbiguous++;
    continue;
  }
  if (expected === 'mathematiques' && actual === 'sciences-informatique-matiere') {
    // Title says "Math" but subject is "Sciences de l'informatique" — could be either (e.g. "Math" in 4AS sc info)
    stats.skipAmbiguous++;
    continue;
  }
  if (expected === 'informatique' && actual === 'mathematiques') {
    // "Informatique" subject in title but tagged as Math
    // Could be valid (e.g. "Mathématiques - 4ème Sciences de l'informatique" with "informatique" in section)
    stats.skipAmbiguous++;
    continue;
  }

  const newSubjectId = subjectMap[expected];
  if (!newSubjectId) {
    stats.skipAmbiguous++;
    continue;
  }

  // Count by expected
  const key = expected.replace(/-/g, '').replace(/(.)(.)/g, (m, a, b) => a + b.toUpperCase());
  const statKey = {
    physique: 'physique',
    svt: 'svt',
    geographie: 'geographie',
    francais: 'francais',
    arabe: 'arabe',
    anglais: 'anglais',
    histoire: 'histoire',
    philosophie: 'philosophie',
    economie: 'economie',
    technologie: 'technologie',
    musique: 'musique',
    theatre: 'theatre',
    'education-islamique': 'educationIslamique',
    'education-civique': 'educationCivique',
    gestion: 'gestion',
    sport: 'sport',
    'histoire-geographie': 'histoireGeo',
    '3eme-langue': 'troisiemeLangue',
    'pensee-islamique': 'penseeIslamique',
  }[expected] || 'unchanged';
  stats[statKey] = (stats[statKey] || 0) + 1;

  batch.push(p.resource.update({
    where: { id: r.id },
    data: { subjectId: newSubjectId }
  }));

  if (batch.length >= BATCH_SIZE) {
    await Promise.all(batch);
    batch = [];
  }
}

if (batch.length > 0) {
  await Promise.all(batch);
}

console.log('\n=== Summary ===');
console.log(JSON.stringify(stats, null, 2));

await p.$disconnect();

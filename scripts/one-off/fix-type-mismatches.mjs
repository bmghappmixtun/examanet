/**
 * fix-type-mismatches.mjs
 *
 * Fix REAL type mismatches where the title keyword clearly indicates a different type.
 *
 * Patterns fixed:
 * 1. Title has "Cours" or "درس" or "Leçon" but type=HOMEWORK → update to COURSE (545)
 * 2. Title has "Devoir" but type=COURSE → update to HOMEWORK (104)
 * 3. Title has "Série" (with strong signal like "d'exercices") but type=HOMEWORK → update to EXERCISE (308)
 *
 * Excluded ambiguous cases (too risky):
 * - "Cours" appearing in subject context (e.g. "Au cours de la photosynthèse")
 * - "Devoir" without clear homework signal
 * - Files imported with no real type indicator
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const all = await p.resource.findMany({
  where: { status: 'PUBLISHED' },
  select: { id: true, title: true, type: true }
});

console.log(`Loaded ${all.length} resources`);

const stats = {
  courseFromHomework: 0,
  homeworkFromCourse: 0,
  exerciseFromHomework: 0,
  summaryFromHomework: 0,
  bacFromHomework: 0,
};

let batch = [];
const BATCH_SIZE = 100;

function isCourseTitle(title) {
  const t = title.toLowerCase();
  // "Cours - X" or "Cours de/du/..." or "Cours X" (with capital or context)
  if (/^cours\s*[-:]/i.test(title)) return true;  // "Cours - Physique..."
  if (/^cours\s+de\s+/i.test(title)) return true;
  if (/^cours\s+\w/i.test(title)) return true;
  if (/^\s*leçon\s*[-:]/i.test(title)) return true;
  if (/^درس\b/.test(title)) return true;  // Arabic
  if (/\bcours\s*bac\b/i.test(title)) return true;  // "Cours Bac Sc.Exp"
  // "Statistiques Cours" or "Variables aléatoires Cours" — title with "Cours" as last word
  if (/\bcours\s*$/i.test(title)) return true;
  if (/\bcours\s+(?:de|du|sur)\b/i.test(title)) return true;
  return false;
}

function isHomeworkTitle(title) {
  const t = title.toLowerCase();
  if (/devoir\s*de\s*synth[èe]se/.test(t)) return true;
  if (/devoir\s*de\s*contr[oô]le/.test(t)) return true;
  if (/devoir\s*de\s*maison/.test(t)) return true;
  if (/devoir\s*de\s*r[ée]vision/.test(t)) return true;
  if (/devoir\s*(?:corrig[ée])?\s*n[°ºo]/.test(t)) return true;  // "Devoir Corrigé N°..."
  if (/devoir\s+(?:de\s*)?(?:synth|contr|révis|maison)/.test(t)) return true;
  if (/^devoir\s*[-:]/.test(t)) return true;
  // Arabic
  if (/فرض\s*تأليفي/.test(t)) return true;
  if (/فرض\s*مراقبة/.test(t)) return true;
  if (/فرض\s*(?:كتاب|تاليفي|مراقبة)/.test(t)) return true;
  if (/اختبار\s*كتابي/.test(t)) return true;
  return false;
}

function isExerciseTitle(title) {
  const t = title.toLowerCase();
  // Strong signals
  if (/s[ée]rie\s*d.exercices|s[ée]rie\s*dexercices|s[ée]rie\s*d.exercice/i.test(title)) return true;
  if (/^s[ée]rie\s*[-:]/i.test(title)) return true;
  if (/^s[ée]rie\s+n[°ºo]/i.test(title)) return true;
  if (/\bs[ée]rie\b.*\b(chimie|physique|math|svt|exercice|exo)/.test(t)) return true;
  // "Série" with chapter indicator
  if (/\bs[ée]rie\s+\d/.test(t)) return true;  // "Série 1 X", "Série 10 X"
  return false;
}

for (const r of all) {
  if (!r.title) continue;
  const title = r.title;

  // CASE 1: Course title but type=HOMEWORK
  if (r.type === 'HOMEWORK' && isCourseTitle(title)) {
    stats.courseFromHomework++;
    batch.push(p.resource.update({
      where: { id: r.id },
      data: { type: 'COURSE' }
    }));
  }
  // CASE 2: Homework title but type=COURSE
  else if (r.type === 'COURSE' && isHomeworkTitle(title)) {
    stats.homeworkFromCourse++;
    batch.push(p.resource.update({
      where: { id: r.id },
      data: { type: 'HOMEWORK' }
    }));
  }
  // CASE 3: Exercise title but type=HOMEWORK
  else if (r.type === 'HOMEWORK' && isExerciseTitle(title)) {
    stats.exerciseFromHomework++;
    batch.push(p.resource.update({
      where: { id: r.id },
      data: { type: 'EXERCISE' }
    }));
  }

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
console.log(`\nTotal fixed: ${Object.values(stats).reduce((a, b) => a + b, 0)}`);

await p.$disconnect();

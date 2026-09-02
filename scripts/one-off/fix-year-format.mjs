/**
 * fix-year-format.mjs
 *
 * Standardize year format in DB.
 *
 * Issues detected by audit:
 * - 2838 year mismatches
 * - Many have "2010" in DB but title says "(2010-2011)"
 * - Some have wrong year (e.g. "2023-2024" in DB but "2025-2026" in title)
 *
 * Strategy:
 * 1. For resources where title has a year range and DB has single year → update DB to range
 * 2. For resources where title has single year and DB has range → update DB to single
 * 3. For resources where title and DB years are clearly different (one doesn't match the other) → update DB to title year
 *
 * Pattern: title year is in parens at the end, e.g. "Math - 3ème (2020-2021)"
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

function extractYearFromTitle(title) {
  if (!title) return null;
  // Match " (YYYY-YYYY)" or "(YYYY)"
  const rangeMatch = title.match(/[(]?(\d{4})\s*[-–]\s*(\d{4})[)]?/);
  if (rangeMatch) {
    return { type: 'range', value: `${rangeMatch[1]}-${rangeMatch[2]}` };
  }
  const singleMatch = title.match(/[(]?(\d{4})[)]?\s*$/);
  if (singleMatch) {
    return { type: 'single', value: singleMatch[1] };
  }
  return null;
}

const all = await p.resource.findMany({
  where: { status: 'PUBLISHED' },
  select: { id: true, title: true, year: true }
});

console.log(`Loaded ${all.length} resources`);

const stats = {
  rangeToSingle: 0,
  singleToRange: 0,
  wrongYear: 0,
  unchanged: 0,
  noYearInTitle: 0,
};

let batch = [];
const BATCH_SIZE = 100;

for (const r of all) {
  const detected = extractYearFromTitle(r.title);
  if (!detected) {
    stats.noYearInTitle++;
    continue;
  }

  if (r.year === detected.value) {
    stats.unchanged++;
    continue;
  }

  // DB has different format
  if (r.year && /^\d{4}$/.test(r.year) && detected.type === 'range') {
    // DB has single year, title has range
    stats.singleToRange++;
    batch.push(p.resource.update({
      where: { id: r.id },
      data: { year: detected.value }
    }));
  } else if (r.year && /^\d{4}-\d{4}$/.test(r.year) && detected.type === 'single') {
    // DB has range, title has single — keep the range
    stats.unchanged++;
  } else {
    // Different values — title is source of truth
    stats.wrongYear++;
    batch.push(p.resource.update({
      where: { id: r.id },
      data: { year: detected.value }
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

await p.$disconnect();

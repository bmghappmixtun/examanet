#!/usr/bin/env node
/**
 * scripts/probe-bac-manifest.mjs
 *
 * Probes bacweb.tn for all existing BAC PDFs and generates a deduplicated
 * list of entries.
 *
 * Output: /tmp/probed-manifest.json (intermediate)
 * Used by: scripts/generate-bac-manifest.mjs
 *
 * Run: node scripts/probe-bac-manifest.mjs
 *
 * Behavior:
 *  - Probes each (year × session × section × subject) combination
 *  - Returns only entries where the upstream URL returns 200
 *  - Deduplicates by URL (e.g. "mathematiques" and "math" both map to math.pdf)
 */
import fs from 'node:fs';
import path from 'node:path';

const subjectToFile = {
  'arabe': 'arabe',
  'francais': 'francais',
  'anglais': 'anglais',
  'mathematiques': 'math',
  'philosophie': 'philosophie',
  'histoire-geo': 'his_geo',
  'physique': 'physique',
  'svt': 'svt',
  'economie': 'economie',
  'gestion': 'gestion',
  'informatique': 'informatique',
  'algorithme': 'algorithme',
  'bases-donnees': 'bd',
  'technique': 'technique',
  'sport': 'sport',
  'eps': 'eps',
  'italien': 'italien',
  'portugais': 'portugais',
  'allemand': 'allemand',
  'musique_a': 'musique_a',
  'art': 'art',
};

const sections = [
  { slug: 'math', raw: 'math' },
  { slug: 'sc-exp', raw: 'sciences_ex' },
  { slug: 'sc-tech', raw: 'technique' },
  { slug: 'sc-info', raw: 'informatique' },
  { slug: 'eco-gestion', raw: 'economie_gestion' },
  { slug: 'lettres', raw: 'lettre' },
  { slug: 'sport', raw: 'sport' },
];

const fileToSubjects = {};
for (const [key, file] of Object.entries(subjectToFile)) {
  if (!fileToSubjects[file]) fileToSubjects[file] = [];
  fileToSubjects[file].push(key);
}

async function checkUrl(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.status;
  } catch (e) {
    return 0;
  }
}

async function probeYearSession(year, session, type) {
  const urlToEntry = new Map();
  const uniqueFiles = [...new Set(Object.values(subjectToFile))];

  for (const section of sections) {
    for (const file of uniqueFiles) {
      const url = `http://www.bacweb.tn/bac/${year}/${session}/${section.raw}/${file}.pdf`;
      const status = await checkUrl(url);
      if (status === 200) {
        const subjectSlugs = fileToSubjects[file] || [];
        const subjectSlug = subjectSlugs[0];
        const key = `bac/officials/${year}/${section.slug}/${session}/${type}/${subjectSlug}.pdf`;
        urlToEntry.set(url, {
          key, url, size: 0, year,
          section: section.slug,
          sectionRaw: section.raw,
          session, type,
          subject: subjectSlug,
          subjectCode: subjectSlug,
          subjectMeta: { nameFr: subjectSlug, nameAr: subjectSlug, color: 'gray' },
          source: 'bacweb.tn',
          namespace: 'officials',
          status: 'pending',
        });
      }
    }
  }
  return [...urlToEntry.values()];
}

async function main() {
  const years = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const sessions = ['principale', 'controle'];
  const types = ['sujets'];

  const queue = [];
  for (const year of years) {
    for (const session of sessions) {
      for (const type of types) {
        queue.push({ year, session, type });
      }
    }
  }
  console.log(`Probing ${queue.length} year/session/type combinations...`);

  const allEntries = [];
  const concurrency = 8;
  let processed = 0;
  const start = Date.now();
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;
        const entries = await probeYearSession(task.year, task.session, task.type);
        allEntries.push(...entries);
        processed++;
        if (processed % 5 === 0) {
          const elapsed = (Date.now() - start) / 1000;
          console.log(`[${processed}/${queue.length}] found=${allEntries.length} ${(processed/elapsed).toFixed(2)}/s`);
        }
      }
    })());
  }
  await Promise.all(workers);

  console.log(`\n=== Total found: ${allEntries.length} ===`);
  fs.writeFileSync('/tmp/probed-manifest.json', JSON.stringify(allEntries, null, 2));
  console.log('Saved to /tmp/probed-manifest.json');

  const byYear = {};
  for (const e of allEntries) {
    byYear[e.year] = (byYear[e.year] || 0) + 1;
  }
  console.log('\nBy year:');
  for (const [y, c] of Object.entries(byYear).sort()) {
    console.log(`  ${y}: ${c}`);
  }
}

main().catch(console.error);

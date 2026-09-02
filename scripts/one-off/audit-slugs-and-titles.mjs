/**
 * audit-slugs-and-titles.mjs
 *
 * Comprehensive audit of all 15K resource slugs and titles.
 * Detects:
 *  - Random cuid suffix at end of slug (e.g. "...-DdGvod")
 *  - Stripped accents (e.g. "synthse" instead of "synthese")
 *  - .pdf in slug
 *  - HTML entities in title (e.g. "&amp;amp;")
 *  - Duplicate slugs
 *  - Slugs that are too long (>80 chars)
 *  - Slugs with multiple consecutive hyphens
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const p = new PrismaClient();

const all = await p.resource.findMany({
  where: { status: 'PUBLISHED' },
  select: { id: true, slug: true, title: true, type: true, updatedAt: true }
});

console.log(`Loaded ${all.length} resources\n`);

const stats = {
  cuidSuffix: 0,
  strippedAccents: 0,
  pdfInSlug: 0,
  htmlEntitiesInTitle: 0,
  weirdCharsInTitle: 0,
  tooLongSlug: 0,
  multipleHyphens: 0,
  duplicateSlugs: 0,
  needsFullRegen: 0,
};

const issues = [];

const cuidSuffixRegex = /-[a-zA-Z0-9]{6}$/;

function hasStrippedAccents(slug) {
  const checks = [
    { missing: 'synthse', should: 'synthese' },
    { missing: 'corrigee', should: 'corrigee' },
    { missing: 'equilibr', should: 'equilibre' },
    { missing: 'physiqu', should: 'physique' },
    { missing: 'mathematiq', should: 'mathematique' },
    { missing: 'matiere', should: 'matiere' },
    { missing: 'economie', should: 'economie' },
    { missing: 'controle', should: 'controle' },
    { missing: 'organiqu', should: 'organique' },
    { missing: 'mecaniq', should: 'mecanique' },
    { missing: 'electriq', should: 'electrique' },
    { missing: 'magnetiqu', should: 'magnetique' },
    { missing: 'thermiqu', should: 'thermique' },
    { missing: 'optiqu', should: 'optique' },
    { missing: 'nuclaire', should: 'nuclaire' },
    { missing: 'reduction', should: 'reduction' },
    { missing: 'oxydation', should: 'oxydation' },
  ];
  for (const c of checks) {
    if (slug.includes(c.missing) && !slug.includes(c.should)) return true;
  }
  return false;
}

const htmlEntityRegex = /&[a-z]+;|&#[0-9]+;|&#x?[0-9a-f]+;/i;

for (const r of all) {
  const issuesForThis = [];

  if (cuidSuffixRegex.test(r.slug)) {
    stats.cuidSuffix++;
    issuesForThis.push('cuid-suffix');
  }

  if (hasStrippedAccents(r.slug)) {
    stats.strippedAccents++;
    issuesForThis.push('stripped-accents');
  }

  if (r.slug.includes('.pdf') || /[a-z]pdf/.test(r.slug) || r.slug.endsWith('pdf')) {
    stats.pdfInSlug++;
    issuesForThis.push('pdf-in-slug');
  }

  if (htmlEntityRegex.test(r.title || '')) {
    stats.htmlEntitiesInTitle++;
    issuesForThis.push('html-entities');
  }

  if (r.slug.length > 80) {
    stats.tooLongSlug++;
    issuesForThis.push('too-long');
  }

  if (/--+/.test(r.slug)) {
    stats.multipleHyphens++;
    issuesForThis.push('multiple-hyphens');
  }

  if (issuesForThis.length > 0) {
    stats.needsFullRegen++;
    issues.push({ id: r.id, slug: r.slug, title: r.title, issues: issuesForThis });
  }
}

const slugCounts = {};
for (const r of all) {
  slugCounts[r.slug] = (slugCounts[r.slug] || 0) + 1;
}
const dups = Object.entries(slugCounts).filter(([_, c]) => c > 1);
stats.duplicateSlugs = dups.length;

console.log('=== Audit Statistics ===');
console.log(`Total checked: ${all.length}`);
console.log(`Resources needing regen: ${stats.needsFullRegen}`);
console.log(`\nIssue breakdown:`);
console.log(`  cuid suffix at end:     ${stats.cuidSuffix}`);
console.log(`  stripped accents:       ${stats.strippedAccents}`);
console.log(`  .pdf in slug:           ${stats.pdfInSlug}`);
console.log(`  HTML entities in title: ${stats.htmlEntitiesInTitle}`);
console.log(`  too long (>80):         ${stats.tooLongSlug}`);
console.log(`  multiple hyphens:       ${stats.multipleHyphens}`);
console.log(`  duplicate slugs:        ${stats.duplicateSlugs}`);

const examplesByType = {
  'cuid-suffix': [],
  'stripped-accents': [],
  'pdf-in-slug': [],
  'html-entities': [],
  'too-long': [],
  'multiple-hyphens': [],
};
for (const issue of issues) {
  for (const t of issue.issues) {
    if (examplesByType[t] && examplesByType[t].length < 5) {
      examplesByType[t].push(issue);
    }
  }
}

console.log('\n=== Examples ===');
for (const [type, examples] of Object.entries(examplesByType)) {
  if (examples.length === 0) continue;
  console.log(`\n[${type}]`);
  for (const e of examples) {
    console.log(`  slug: ${e.slug}`);
    console.log(`  title: ${(e.title || '').substring(0, 80)}`);
  }
}

if (dups.length > 0) {
  console.log('\n=== Duplicate slugs (first 10) ===');
  for (const [slug, count] of dups.slice(0, 10)) {
    console.log(`  "${slug}": ${count} times`);
  }
}

const csv = 'id,slug,title,issues\n' + issues.map(i =>
  `${i.id},"${i.slug}","${(i.title || '').replace(/"/g, '""').replace(/\n/g, ' ')}","${i.issues.join('|')}"`
).join('\n');
fs.writeFileSync('scripts/one-off/slug-issues.csv', csv);
console.log(`\nWrote ${issues.length} issues to scripts/one-off/slug-issues.csv`);

await p.$disconnect();

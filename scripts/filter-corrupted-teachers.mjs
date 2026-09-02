#!/usr/bin/env node
/**
 * Filter out corrupted teacher entries (2026-08-19)
 *
 * Removes entries that are likely corrupted/test data:
 * - lastName = "—" (em-dash placeholder)
 * - lastName has multiple words (suggests concatenation, e.g. "Md Lassaad")
 * - firstName = lowercase (e.g. "ghazouani") or ALL CAPS
 * - lastName = "." or starts with "." (e.g. ".G")
 * - lastName looks like a list (contains "|" or ".")
 * - firstName has dots (e.g. "Ilhem. Saoussen")
 * - Test names: "toto", "test"
 */
import fs from 'fs';

const input = fs.readFileSync('scripts/teachers-missing-ar.csv', 'utf8');
const lines = input.split('\n').filter(Boolean);
const header = lines[0];
const rows = lines.slice(1).map(l => l.split(','));

const corruptedReasons = (firstName, lastName) => {
  const reasons = [];
  if (lastName === '—' || lastName === '-') reasons.push('lastName=placeholder');
  if (lastName && lastName.includes(' ')) reasons.push('lastName=multi-word');
  if (lastName && lastName.includes('|')) reasons.push('lastName=has-pipe');
  if (lastName && lastName.startsWith('.')) reasons.push('lastName=starts-with-dot');
  if (lastName && lastName === 'G') reasons.push('lastName=just-letter');
  if (firstName && firstName === firstName.toUpperCase() && firstName.length > 2) reasons.push('firstName=ALL-CAPS');
  if (firstName && firstName.includes('.')) reasons.push('firstName=has-dot');
  if (firstName && firstName.length < 3) reasons.push('firstName=too-short');
  if (firstName && ['toto', 'test', 'xxx', 'abc', 'asdf'].includes(firstName.toLowerCase())) reasons.push('test-name');
  if (firstName && /^\d+$/.test(firstName)) reasons.push('firstName=only-digits');
  return reasons;
};

const clean = [];
const corrupted = [];
for (const row of rows) {
  const numericId = row[0];
  const firstName = row[1]?.replace(/^"|"$/g, '') || '';
  const lastName = row[2]?.replace(/^"|"$/g, '') || '';
  const firstNameAr = row[3] || '';
  const lastNameAr = row[4] || '';
  const profileUrl = row[5] || '';
  
  const reasons = corruptedReasons(firstName, lastName);
  if (reasons.length === 0) {
    clean.push([numericId, firstName, lastName, firstNameAr, lastNameAr, profileUrl]);
  } else {
    corrupted.push([numericId, firstName, lastName, reasons.join('|')]);
  }
}

console.log(`Original: ${rows.length}`);
console.log(`Clean: ${clean.length}`);
console.log(`Corrupted: ${corrupted.length}`);
console.log('');

// Write clean CSV
const csvOut = [header, ...clean.map(r => r.join(','))].join('\n');
fs.writeFileSync('scripts/teachers-missing-ar-clean.csv', csvOut + '\n');

// Write corrupted for review
const corruptedOut = ['numericId,firstName,lastName,reasons', ...corrupted.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','))].join('\n');
fs.writeFileSync('scripts/teachers-missing-ar-corrupted.csv', corruptedOut + '\n');

console.log('Clean CSV: scripts/teachers-missing-ar-clean.csv');
console.log('Corrupted CSV: scripts/teachers-missing-ar-corrupted.csv');

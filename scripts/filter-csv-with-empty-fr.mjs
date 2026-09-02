#!/usr/bin/env node
import fs from 'fs';
const input = fs.readFileSync('scripts/teachers-ar-only.csv', 'utf8');
const lines = input.split('\n').filter(Boolean);
const header = lines[0].split(',');
// New header: add firstName, lastName (FR) as empty
const newHeader = ['numericId', 'firstName', 'lastName', 'firstNameAr', 'lastNameAr', 'profileUrl'].join(',');
const newRows = [newHeader];
for (const line of lines.slice(1)) {
  const parts = line.split(',');
  // parts: [numericId, firstNameAr, lastNameAr, profileUrl]
  const numericId = parts[0];
  const firstNameAr = parts[1];
  const lastNameAr = parts[2];
  const profileUrl = parts[3];
  // Add empty firstName, lastName
  newRows.push([numericId, '', '', firstNameAr, lastNameAr, profileUrl].join(','));
}
const csv = newRows.join('\n') + '\n';
fs.writeFileSync('scripts/teachers-ar-with-empty-fr.csv', csv);
console.log('Wrote scripts/teachers-ar-with-empty-fr.csv with', newRows.length - 1, 'rows');
console.log('');
console.log('First 10:');
for (const r of newRows.slice(1, 11)) console.log(' ', r);

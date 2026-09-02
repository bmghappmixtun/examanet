#!/usr/bin/env node
import fs from 'fs';
const input = fs.readFileSync('scripts/teachers-fr-has-ar.csv', 'utf8');
const lines = input.split('\n').filter(Boolean);
const header = lines[0].split(',');
// Keep: numericId, firstNameAr, lastNameAr, profileUrl
const idxNumeric = header.indexOf('numericId');
const idxFnAr = header.indexOf('firstNameAr');
const idxLnAr = header.indexOf('lastNameAr');
const idxUrl = header.indexOf('profileUrl');
const newHeader = ['numericId', 'firstNameAr', 'lastNameAr', 'profileUrl'].join(',');
const newRows = [newHeader];
for (const line of lines.slice(1)) {
  const parts = line.split(',');
  newRows.push([parts[idxNumeric], parts[idxFnAr], parts[idxLnAr], parts[idxUrl]].join(','));
}
const csv = newRows.join('\n') + '\n';
fs.writeFileSync('scripts/teachers-ar-only.csv', csv);
console.log('Wrote scripts/teachers-ar-only.csv with', newRows.length - 1, 'rows');
console.log('');
console.log('First 10:');
for (const r of newRows.slice(1, 11)) console.log(' ', r);

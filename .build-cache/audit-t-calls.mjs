import fs from 'fs';
import path from 'path';

const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

function getNested(obj, key) {
  return key.split('.').reduce((acc, k) => acc?.[k], obj);
}

function flatWithValues(obj, prefix = '', acc = {}) {
  for (const key of Object.keys(obj || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      flatWithValues(val, fullKey, acc);
    } else {
      acc[fullKey] = val;
    }
  }
  return acc;
}

const frAll = flatWithValues(fr);

// Walk src/app/**/page.tsx and find all t('...') calls
const pagesDir = './src/app';
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name === 'page.tsx' || entry.name === 'layout.tsx') {
      files.push(full);
    }
  }
}
walk(pagesDir);

const regex = /\b(t|tt)\(['"`]([^'"`]+)['"`]/g;
const issues = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  const seen = new Set();
  while ((match = regex.exec(content)) !== null) {
    const key = match[2];
    if (seen.has(key)) continue;
    seen.add(key);
    const frVal = getNested(fr, key);
    const arVal = getNested(ar, key);
    if (frVal === undefined) {
      issues.push({ file, key, issue: 'Missing in JSON' });
    }
  }
}

console.log(`Scanned ${files.length} page.tsx files.`);
console.log(`Found ${issues.length} issues:`);
issues.forEach(i => console.log(`  ${i.file}: ${i.key} — ${i.issue}`));

import fs from 'fs';

const fr = JSON.parse(fs.readFileSync('./src/messages/fr.json', 'utf8'));
const ar = JSON.parse(fs.readFileSync('./src/messages/ar.json', 'utf8'));

function flat(obj, prefix = '', acc = {}) {
  for (const key of Object.keys(obj || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      flat(val, fullKey, acc);
    } else {
      acc[fullKey] = val;
    }
  }
  return acc;
}

const frKeys = flat(fr);
const arKeys = flat(ar);

const frSet = new Set(Object.keys(frKeys));
const arSet = new Set(Object.keys(arKeys));

const missingInAR = [...frSet].filter(k => !arSet.has(k));
const missingInFR = [...arSet].filter(k => !frSet.has(k));

console.log(`Total FR leaf keys: ${frSet.size}`);
console.log(`Total AR leaf keys: ${arSet.size}`);
console.log(`\nMissing in AR (${missingInAR.length}):`);
missingInAR.forEach(k => console.log(`  ${k}: ${JSON.stringify(frKeys[k])}`));
console.log(`\nMissing in FR (${missingInFR.length}):`);
missingInFR.forEach(k => console.log(`  ${k}: ${JSON.stringify(arKeys[k])}`));

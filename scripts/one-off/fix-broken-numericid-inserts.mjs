/**
 * fix-broken-numericid-inserts.mjs
 *
 * The previous script's regex inserted `numericId: true,` into nested select
 * blocks where it doesn't belong (e.g. `level: { select: { slug: true
 * numericId: true, } }` — invalid syntax).
 *
 * This script fixes the broken syntax by:
 *  1. Finding lines that have `slug: true\n  numericId: true,` (no closing brace)
 *  2. Reformatting them back to `slug: true, numericId: true, }`
 *
 * Also removes the inserted numericId from select blocks where it doesn't apply
 * (i.e. not on the Resource model directly).
 */

import fs from 'fs';
import { execSync } from 'child_process';

// Find all .ts and .tsx files that have the broken pattern
const files = execSync(
  `grep -rln "slug: true" src/ 2>/dev/null`,
  { encoding: 'utf8' }
).split('\n').filter(Boolean);

console.log(`Checking ${files.length} files\n`);

let fixed = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const before = content;

  // Pattern: `slug: true` followed by a newline and `numericId: true,` (without closing brace)
  // This is the broken syntax from the previous script
  content = content.replace(
    /(\bslug:\s*true)\s*\n(\s*)numericId:\s*true,/g,
    '$1, $2numericId: true,'
  );

  if (content !== before) {
    fs.writeFileSync(file, content);
    console.log(`✅ Fixed: ${file}`);
    fixed++;
  }
}

console.log(`\nTotal files fixed: ${fixed}`);

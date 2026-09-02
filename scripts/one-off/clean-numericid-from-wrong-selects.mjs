/**
 * clean-numericid-from-wrong-selects.mjs
 *
 * Removes `numericId: true` from all select blocks that are NOT directly on
 * the Resource model. The numericId field only exists on Resource.
 *
 * Strategy:
 *  - Find all `numericId: true,` lines
 *  - Check if the previous 15 lines contain `prisma.resource.`
 *  - If NOT, remove the line
 */

import fs from 'fs';
import { execSync } from 'child_process';

const files = execSync(`grep -rln "numericId: true" src/ 2>/dev/null`, { encoding: 'utf8' })
  .split('\n').filter(Boolean);

let removed = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const newLines = [];
  let fileChanged = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Match `numericId: true,` (with or without trailing comma) on its own line
    if (/^numericId:\s*true\s*,?\s*$/.test(trimmed)) {
      // Check the previous 15 lines for a Resource query marker
      const context = lines.slice(Math.max(0, i - 15), i).join('\n');
      const isResourceQuery = /prisma\.resource\./.test(context);
      if (!isResourceQuery) {
        // Check that we're NOT inside a Resource query (e.g. as a `include` on Subject)
        // AND remove only if not in a Resource query
        fileChanged = true;
        removed++;
        continue; // skip this line
      }
    }
    newLines.push(line);
  }

  if (fileChanged) {
    fs.writeFileSync(file, newLines.join('\n'));
    console.log(`✅ ${file}: cleaned`);
  }
}

console.log(`\nTotal lines removed: ${removed}`);

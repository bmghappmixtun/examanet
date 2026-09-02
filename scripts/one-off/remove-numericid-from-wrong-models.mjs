/**
 * remove-numericid-from-wrong-models.mjs
 *
 * The previous scripts added `numericId: true` to all Prisma select blocks
 * containing `slug: true`, but only the Resource model has this field.
 *
 * This script removes the `numericId: true,` (and `numericId: true` at the end
 * of a line) from select blocks that are NOT on the Resource model.
 *
 * Strategy: find all lines containing `numericId: true,` or `numericId: true }`
 * and check if they're inside a `prisma.resource.*` query.
 *
 * Heuristic: a select block is "on Resource" if it's preceded (within the
 * same query chain) by a `prisma.resource.*` call. Otherwise, remove the
 * `numericId: true,` line.
 *
 * This is conservative: it keeps `numericId` only if the surrounding context
 * is clearly a Resource query.
 */

import fs from 'fs';
import { execSync } from 'child_process';

const files = execSync(
  `grep -rln "numericId: true" src/ 2>/dev/null`,
  { encoding: 'utf8' }
).split('\n').filter(Boolean);

console.log(`Found ${files.length} files with numericId: true\n`);

let totalRemoved = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const before = content;

  // For each line containing `numericId: true,` or `numericId: true }`,
  // check if the previous 30 lines contain `prisma.resource.`
  const lines = content.split('\n');
  const newLines = [];
  let removed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^\s*numericId:\s*true[,]?\s*$/)) {
      // Check the previous 30 lines for `prisma.resource.`
      const context = lines.slice(Math.max(0, i - 30), i).join('\n');
      const isResourceQuery = /prisma\.resource\./.test(context);
      if (!isResourceQuery) {
        // Remove this line
        removed++;
        continue;
      }
    }
    newLines.push(line);
  }

  if (removed > 0) {
    content = newLines.join('\n');
    fs.writeFileSync(file, content);
    console.log(`✅ ${file}: removed ${removed} wrong numericId lines`);
    totalRemoved += removed;
  }
}

console.log(`\nTotal lines removed: ${totalRemoved}`);

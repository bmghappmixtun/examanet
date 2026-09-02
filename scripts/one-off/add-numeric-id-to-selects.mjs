/**
 * add-numeric-id-to-selects.mjs
 *
 * For all Prisma queries that select `slug: true`, also add `numericId: true`
 * so the new URL pattern /ressources/{numericId}/{slug} can be built.
 *
 * Targets:
 *  - `select: { slug: true, ... }` patterns
 *  - `include: { ..., _count: { select: { ..., slug: true }}}` — uncommon
 *
 * Idempotent: skips selects that already have `numericId: true`.
 */

import fs from 'fs';
import { execSync } from 'child_process';

// Find all .ts and .tsx files in src/ that might have Prisma queries
const files = execSync('grep -rln "slug: true" src/ 2>/dev/null', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

console.log(`Found ${files.length} files with "slug: true"\n`);

let totalAdded = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const before = content;

  // Pattern: `slug: true,` followed by anything (within a select block)
  // We want to add `numericId: true,` if not already present in the same select
  // This is tricky with regex because of nested objects. Let me use a simpler approach:
  // Replace `slug: true,` with `slug: true,\n        numericId: true,` if not already there.
  // But this is line-based — let me find select blocks first.

  // Use a multi-line regex to find select blocks containing slug: true
  // and check if they also contain numericId: true
  content = content.replace(
    /select:\s*\{([^}]*slug:\s*true[^}]*)\}/g,
    (match, inner) => {
      // If numericId: true is already in this block, skip
      if (/numericId:\s*true/.test(inner)) return match;
      // Add numericId: true to the block
      // Try to add it on a new line after slug
      return match.replace(
        /(slug:\s*true,?)/,
        `$1\n        numericId: true,`
      );
    }
  );

  if (content !== before) {
    fs.writeFileSync(file, content);
    const added = (before.match(/select:\s*\{[^}]*slug:\s*true[^}]*\}/g) || []).length;
    console.log(`✅ ${file}: updated ${added} select blocks`);
    totalAdded += added;
  }
}

console.log(`\nTotal select blocks updated: ${totalAdded}`);

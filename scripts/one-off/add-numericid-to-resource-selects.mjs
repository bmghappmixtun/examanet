/**
 * add-numericid-to-resource-selects.mjs
 *
 * For all `prisma.resource.findMany` / `findUnique` / `findFirst` / `update` etc.
 * queries that have a select block with `slug: true`, ensure they also have
 * `numericId: true` (since the new URL pattern uses numericId).
 *
 * Idempotent: skips selects that already have numericId.
 */

import fs from 'fs';
import { execSync } from 'child_process';

const files = execSync(
  `grep -rln "prisma.resource" src/ 2>/dev/null`,
  { encoding: 'utf8' }
).split('\n').filter(Boolean);

let added = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const before = content;

  // Find each Resource query and its select block
  // Pattern: a `prisma.resource.<op>(` followed eventually by `select: { ... slug: true, ... }`
  // We need to add `numericId: true,` after `slug: true,` in that select block.

  // Simple approach: find all select blocks that have slug: true AND are inside a Resource query
  // This is tricky to do with regex, so let me use a line-by-line state machine.

  const lines = content.split('\n');
  const newLines = [];
  let insideResourceQuery = false;
  let depth = 0;
  let selectDepth = -1;
  let inSelect = false;
  let braceStack = [];
  let pendingNumericId = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    newLines.push(line);

    // Detect entry into a Resource query
    if (/prisma\.resource\./.test(line)) {
      insideResourceQuery = true;
      depth = 0;
      inSelect = false;
    }

    // Track braces
    for (const ch of line) {
      if (ch === '{') {
        braceStack.push('{');
        if (insideResourceQuery && /select:\s*\{/.test(line) && braceStack.length > depth) {
          // We just entered a select block
          inSelect = true;
          selectDepth = braceStack.length;
        }
      } else if (ch === '}') {
        if (braceStack.length === selectDepth) {
          // Closing the select block
          inSelect = false;
          selectDepth = -1;
        }
        braceStack.pop();
      }
    }

    // Inside a select block, find slug: true and ensure numericId is present
    if (inSelect && /^\s*slug:\s*true\s*,?\s*$/.test(line)) {
      // Check the next 10 lines for numericId
      const nextContext = lines.slice(i + 1, i + 11).join('\n');
      if (!/numericId:\s*true/.test(nextContext)) {
        // Add numericId: true on the next line
        // Determine indentation
        const indent = line.match(/^(\s*)/)[1];
        newLines.push(`${indent}numericId: true,`);
        added++;
      }
    }
  }

  if (content !== before || newLines.join('\n') !== before) {
    const newContent = newLines.join('\n');
    if (newContent !== before) {
      fs.writeFileSync(file, newContent);
      console.log(`✅ ${file}: added numericId to Resource selects`);
    }
  }
}

console.log(`\nTotal numericId added: ${added}`);

/**
 * fix-trimester-format.mjs
 *
 * Standardize trimester format in DB.
 *
 * Background:
 * - The Python import script (scripts/import_to_examanet.py) used "T1", "T2", "T3"
 * - The TypeScript code uses "1", "2", "3" (cleaner, no prefix)
 * - DB currently has 2141 resources with "T1"/"T2"/"T3" format
 * - Frontend expects the no-prefix format
 *
 * This script converts all T1 → 1, T2 → 2, T3 → 3.
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const t1 = await p.resource.count({ where: { trimester: 'T1' } });
const t2 = await p.resource.count({ where: { trimester: 'T2' } });
const t3 = await p.resource.count({ where: { trimester: 'T3' } });
console.log(`Found: T1=${t1}, T2=${t2}, T3=${t3}`);

let total = 0;
for (const [old, newVal] of [['T1', '1'], ['T2', '2'], ['T3', '3']]) {
  const result = await p.resource.updateMany({
    where: { trimester: old },
    data: { trimester: newVal }
  });
  console.log(`  ${old} → ${newVal}: ${result.count} resources updated`);
  total += result.count;
}

console.log(`\nTotal: ${total} resources updated`);

await p.$disconnect();

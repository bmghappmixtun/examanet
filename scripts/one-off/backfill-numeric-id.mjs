/**
 * backfill-numeric-id.mjs
 *
 * Assigns sequential numericId (1, 2, 3, ...) to all existing resources,
 * ordered by createdAt.
 *
 * Idempotent: skips resources that already have a numericId.
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const total = await p.resource.count();
const withId = await p.resource.count({ where: { numericId: { not: null } } });
console.log(`Total resources: ${total}, already with numericId: ${withId}`);

if (withId === total) {
  console.log('Nothing to do.');
  await p.$disconnect();
  process.exit(0);
}

// Get all resources ordered by createdAt, assign sequential IDs
const all = await p.resource.findMany({
  where: { numericId: null },
  orderBy: { createdAt: 'asc' },
  select: { id: true, createdAt: true }
});

console.log(`Need to assign numericId to ${all.length} resources`);

// Use raw SQL for performance — single UPDATE per resource would be 15K queries
// Use a single SQL with row_number()
const updated = await p.$executeRawUnsafe(`
  WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) + ${withId} AS new_id
    FROM "Resource"
    WHERE "numericId" IS NULL
  )
  UPDATE "Resource" r
  SET "numericId" = numbered.new_id
  FROM numbered
  WHERE r.id = numbered.id;
`);

console.log(`Updated ${updated} resources`);

// Verify
const verify = await p.resource.count({ where: { numericId: { not: null } } });
const max = await p.resource.aggregate({ _max: { numericId: true } });
const min = await p.resource.aggregate({ _min: { numericId: true } });
console.log(`Total with numericId: ${verify}, range: ${min._min.numericId} to ${max._max.numericId}`);

await p.$disconnect();

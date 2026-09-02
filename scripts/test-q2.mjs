import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Test different OR syntaxes
const tests = [
  '1as OR 1ere année',
  '"1as" OR "1ere année"',
  '(1as) OR (1ere année)',
  '1as OR "1ere année"',
];

for (const t of tests) {
  const q = await p.$queryRawUnsafe(`SELECT websearch_to_tsquery('french', $1)::text as q`, t);
  const c = await p.$queryRawUnsafe(
    `SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ websearch_to_tsquery('french', $1)`,
    t,
  );
  console.log(`'${t}'`);
  console.log(`  → ${q[0].q} | count: ${c[0].c}`);
}

await p.$disconnect();

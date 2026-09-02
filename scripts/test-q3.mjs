import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const variants = [
  '1as',
  '1ere année secondaire',
  '1ère année secondaire',
  'première année',
  'الأولى ثانوي',
];
const placeholders = variants
  .map((_, i) => `websearch_to_tsquery('french', $${i + 1})`)
  .join(' || ');
const sql = `SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ (${placeholders})`;

const t0 = Date.now();
const r = await p.$queryRawUnsafe(sql, ...variants);
const t = Date.now() - t0;
console.log(`5 OR'd tsqueries: ${r[0].c} in ${t}ms`);

const t0b = Date.now();
const r2 = await p.$queryRawUnsafe(
  `SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ websearch_to_tsquery('french', $1)`,
  '1as',
);
const t2 = Date.now() - t0b;
console.log(`single: ${r2[0].c} in ${t2}ms`);

await p.$disconnect();

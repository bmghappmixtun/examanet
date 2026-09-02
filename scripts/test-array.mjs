import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const variants = ['devoir'];
const variantsArrayParam =
  variants.length === 1
    ? 'ARRAY[$1]::text[]'
    : 'ARRAY[' + variants.map((_, i) => '$' + (i + 1)).join(',') + ']::text[]';
const sql = `SELECT MAX(ts_rank_cd(search_vector, websearch_to_tsquery('french', v.q))) FROM unnest(${variantsArrayParam}) AS v(q)`;
console.log('SQL:', sql);
try {
  const r = await p.$queryRawUnsafe(sql, ...variants);
  console.log('OK:', r);
} catch (e) {
  console.log('ERR:', e.message.split('Code:').pop().slice(0, 200));
}
await p.$disconnect();

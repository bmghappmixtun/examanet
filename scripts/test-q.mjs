import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Cast tsquery to text to inspect
const r1 = await p.$queryRawUnsafe(
  `SELECT websearch_to_tsquery('french', $1)::text as q`,
  '1as OR 1ere année secondaire',
);
console.log('Q1:', r1[0].q);

const r2 = await p.$queryRawUnsafe(
  `SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ websearch_to_tsquery('french', $1)`,
  '1as OR 1ere année secondaire',
);
console.log('Count with OR:', r2[0].c);

const r3 = await p.$queryRawUnsafe(
  `SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ websearch_to_tsquery('french', $1)`,
  '1ere année',
);
console.log('Count for 1ere année alone:', r3[0].c);

const r4 = await p.$queryRawUnsafe(
  `SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ websearch_to_tsquery('french', $1)`,
  '1as',
);
console.log('Count for 1as alone:', r4[0].c);

const r5 = await p.$queryRawUnsafe(
  `SELECT count(*)::int as c FROM "Resource" WHERE search_vector @@ websearch_to_tsquery('french', $1)`,
  'première année',
);
console.log('Count for première année alone:', r5[0].c);

await p.$disconnect();

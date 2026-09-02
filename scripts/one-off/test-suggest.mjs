import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const q = 'sciences';
const results = await p.$queryRaw`
  SELECT 
    s.id, s.slug, s."nameFr", s."nameAr",
    c.slug as "classSlug", c."nameFr" as "className",
    l.slug as "levelSlug",
    (SELECT COUNT(*) FROM "Resource" r WHERE r."sectionId" = s.id AND r.status = 'PUBLISHED')::int as "resourceCount"
  FROM "Section" s
  LEFT JOIN "Class" c ON s."classId" = c.id
  LEFT JOIN "Level" l ON c."levelId" = l.id
  WHERE unaccent(s."nameFr") ILIKE unaccent(${'%' + q + '%'})
     OR unaccent(COALESCE(s."nameAr", '')) ILIKE unaccent(${'%' + q + '%'})
  LIMIT 2
`;
console.log('Found', results.length, 'sections for query:', q);
for (const r of results) {
  console.log(' -', r.nameFr, '|', r.slug, '|', r.resourceCount, 'resources');
}
await p.$disconnect();

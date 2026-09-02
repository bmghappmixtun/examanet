import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const trimmed = 'sciences';
const limit = 2;
try {
  const results = await p.$queryRaw`
    SELECT 
      s.id, s.slug, s."nameFr", s."nameAr",
      c.slug as "classSlug", c."nameFr" as "className",
      l.slug as "levelSlug",
      (SELECT COUNT(*) FROM "Resource" r WHERE r."sectionId" = s.id AND r.status = 'PUBLISHED')::int as "resourceCount"
    FROM "Section" s
    LEFT JOIN "Class" c ON s."classId" = c.id
    LEFT JOIN "Level" l ON c."levelId" = l.id
    WHERE unaccent(s."nameFr") ILIKE unaccent(${`%${trimmed}%`})
       OR unaccent(COALESCE(s."nameAr", '')) ILIKE unaccent(${`%${trimmed}%`})
    LIMIT ${limit}
  `;
  console.log('Found', results.length, 'sections');
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  console.error('Error:', e.message);
}
await p.$disconnect();

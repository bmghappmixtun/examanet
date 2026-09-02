require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  // Find files where the title mentions a collège year (7ème, 8ème, 9ème)
  // but the class is set to lycée
  const candidates = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r."subjectId", r."classId", r."schoolType",
      c.slug as class_slug, c."nameFr" as class_name, l.slug as level_slug,
      s.slug as subject_slug, s."nameFr" as subject_name
    FROM "Resource" r
    JOIN "Subject" s ON r."subjectId" = s.id
    JOIN "Class" c ON r."classId" = c.id
    JOIN "Level" l ON c."levelId" = l.id
    WHERE r.status = 'PUBLISHED'
      AND l.slug = 'lycee'
      AND (
        r.title ~* '\b(7|8|9)[\s-]?(ème|eme|éme|eme)\b'
        OR r.title ~* '\b(7|8|9)e\s+(ann|année|annee)\b'
      )
    ORDER BY r."numericId" ASC
  `;
  
  console.log(`=== Files in lycée with collège year in title: ${candidates.length} ===\n`);
  
  for (const f of candidates.slice(0, 20)) {
    console.log(`#${f.numericId}: ${f.title.substring(0, 90)}`);
    console.log(`   DB: subject=${f.subject_slug}, class=${f.class_name} (${f.level_slug})`);
  }
  if (candidates.length > 20) console.log(`... and ${candidates.length - 20} more`);
  
  await p.$disconnect();
})();

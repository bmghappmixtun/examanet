import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config({ path: '/workspace/edutunisie/.env.local' });
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  // Find the teacher
  const teachers = await p.$queryRaw`
    SELECT id, "firstName", "lastName", "numericId", email, "schoolName"
    FROM "User"
    WHERE role = 'TEACHER' AND id = (
      SELECT id FROM "User"
      WHERE role = 'TEACHER' AND LOWER("firstName" || ' ' || "lastName") LIKE '%ben abdallah%marouan%'
      LIMIT 1
    )
  `;
  const t = teachers[0];
  if (!t) {
    console.log('Teacher not found');
    return;
  }
  console.log('=== Teacher: ' + t.firstName + ' ' + t.lastName + ' (ID=' + t.id + ') ===');

  // Get all their resources with details
  const resources = await p.$queryRaw`
    SELECT r."numericId", r.title, r.type, r.year, r.status,
           c."nameFr" as class, s."nameFr" as section,
           r."hasCorrection", r."schoolType", m."generalSubject"
    FROM "Resource" r
    JOIN "Class" c ON c.id = r."classId"
    LEFT JOIN "Section" s ON s.id = r."sectionId"
    LEFT JOIN "ResourceMetadata" m ON m."resourceId" = r.id
    WHERE r."teacherId" = ${t.id}
    ORDER BY r."numericId"
  `;
  console.log('\n=== Total: ' + resources.length + ' resources ===');
  console.log('By status:', resources.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}));
  console.log('By type:', resources.reduce((a, r) => { a[r.type] = (a[r.type] || 0) + 1; return a; }, {}));
  console.log('By class:', resources.reduce((a, r) => { a[r.class] = (a[r.class] || 0) + 1; return a; }, {}));
  console.log('By section:', resources.reduce((a, r) => { a[r.section || 'NONE'] = (a[r.section || 'NONE'] || 0) + 1; return a; }, {}));

  console.log('\n=== Full list ===');
  resources.forEach(r => {
    console.log('  #' + r.numericId + ' | ' + r.type + ' | ' + r.class + ' / ' + (r.section || '-') + ' | ' + (r.generalSubject || '?') + ' | ' + (r.year || '-') + ' | ' + r.status);
  });

  await p.$disconnect();
}
main().catch(console.error);

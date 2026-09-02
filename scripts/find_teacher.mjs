import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config({ path: '/workspace/edutunisie/.env.local' });
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  // Find the teacher
  const teachers = await p.$queryRaw`
    SELECT id, "firstName", "lastName", "firstNameAr", "lastNameAr", "numericId", email, "schoolName"
    FROM "User"
    WHERE role = 'TEACHER'
      AND (LOWER("firstName" || ' ' || "lastName") LIKE '%ben abdallah%marouan%'
        OR LOWER("firstName" || ' ' || "lastName") LIKE '%marouan%ben abdallah%'
        OR LOWER("firstName" || ' ' || "lastName") LIKE '%marouan%'
        OR LOWER("lastName") LIKE '%marouan%'
        OR LOWER("firstName") LIKE '%marouan%')
  `;
  console.log('=== Teachers matching Marouan or Ben Abdallah ===');
  teachers.forEach(t => {
    console.log('  #' + t.numericId + ': ' + t.firstName + ' ' + t.lastName + ' | ' + t.email + ' | ' + (t.schoolName || 'NULL'));
  });

  // Also check resources with marouan/abdallah in title or meta
  const imported = await p.$queryRaw`
    SELECT r."numericId", r.title, r."importedFrom", r."teacherId"
    FROM "Resource" r
    WHERE r.title ILIKE '%marouan%' OR r.title ILIKE '%abdallah%'
    ORDER BY r."numericId"
    LIMIT 30
  `;
  console.log('\n=== Resources with marouan/abdallah in title ===');
  imported.forEach(r => console.log('  #' + r.numericId + ': ' + r.title.slice(0, 80) + ' | importedFrom=' + (r.importedFrom || 'NULL')));

  // Check resources with this teacher's id
  if (teachers.length > 0) {
    const t = teachers[0];
    const teacherResources = await p.$queryRaw`
      SELECT "numericId", title, status
      FROM "Resource"
      WHERE "teacherId" = ${t.id}
      ORDER BY "numericId"
    `;
    console.log('\n=== Resources by ' + t.firstName + ' ' + t.lastName + ' ===');
    console.log('Total: ' + teacherResources.length);
    teacherResources.slice(0, 15).forEach(r => console.log('  #' + r.numericId + ': ' + r.title.slice(0, 70)));
  }

  await p.$disconnect();
}
main().catch(console.error);

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  console.log('='.repeat(70));
  console.log(' DEEP INVESTIGATION');
  console.log('='.repeat(70));
  
  // 1. Resources with NULL teacher
  console.log('\n=== 4 RESOURCES WITH NULL teacherId ===\n');
  const nullTeacher = await p.resource.findMany({
    where: { teacherId: null },
    select: {
      id: true, slug: true, title: true,
      subject: { select: { nameFr: true } },
      class: { select: { nameFr: true } },
      fileUrl: true,
      fileSize: true,
      createdAt: true,
      publishedAt: true,
      status: true,
    }
  });
  
  for (const r of nullTeacher) {
    console.log(`ID: ${r.id}`);
    console.log(`Title: ${r.title}`);
    console.log(`Slug: ${r.slug}`);
    console.log(`Subject: ${r.subject?.nameFr || 'NULL'} | Class: ${r.class?.nameFr || 'NULL'}`);
    console.log(`Status: ${r.status}`);
    console.log(`Created: ${r.createdAt.toISOString()}`);
    console.log(`Published: ${r.publishedAt?.toISOString() || 'NULL'}`);
    console.log(`File size: ${r.fileSize} bytes (${(r.fileSize/1024).toFixed(1)} KB)`);
    console.log(`File URL: ${r.fileUrl?.substring(0, 80)}...`);
    console.log('---');
  }
  
  // 2. 10 teachers without resources
  console.log('\n=== 10 TEACHERS WITHOUT RESOURCES ===\n');
  const orphanTeachers = await p.$queryRaw`
    SELECT u.id, u.email, u."firstName", u."lastName", u."createdAt", u.role, u.status
    FROM "User" u
    WHERE u.role = 'TEACHER'
    AND NOT EXISTS (SELECT 1 FROM "Resource" r WHERE r."teacherId" = u.id)
    ORDER BY u."createdAt" DESC
  `;
  
  for (const u of orphanTeachers) {
    console.log(`ID: ${u.id}`);
    console.log(`Email: ${u.email}`);
    console.log(`Name: ${u.firstName} ${u.lastName}`);
    console.log(`Status: ${u.status}`);
    console.log(`Created: ${u.createdAt.toISOString()}`);
    
    // Check if they have TeacherFile library entries
    const teacherFiles = await p.teacherFile.count({ where: { teacherId: u.id } });
    if (teacherFiles > 0) {
      console.log(`  Has ${teacherFiles} teacher files in library`);
    }
    console.log('---');
  }
  
  await p.$disconnect();
})();

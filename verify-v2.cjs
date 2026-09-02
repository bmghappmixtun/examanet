const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Find newly created import teachers
  const teachers = await p.user.findMany({
    where: {
      email: { contains: 'examanet-import.local' },
      role: 'TEACHER',
      createdAt: { gte: new Date('2026-07-05T15:00:00') }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  
  console.log(`\n=== ${teachers.length} NEW import teachers ===\n`);
  
  for (const t of teachers) {
    const ress = await p.resource.findMany({
      where: { teacherId: t.id },
      select: {
        title: true,
        fileUrl: true,
        fileSize: true,
        originalFileKey: true,
        originalFileName: true,
        originalFormat: true,
        originalFileSize: true,
        slug: true,
      }
    });
    
    console.log(`--- ${t.firstName} ${t.lastName} | ${t.email} ---`);
    console.log(`   ID: ${t.id}`);
    console.log(`   Created: ${t.createdAt.toISOString()}`);
    console.log(`   Status: ${t.status} (${t.isVerifiedTeacher ? 'verified' : 'unverified'})`);
    console.log(`   Resources: ${ress.length}`);
    
    ress.forEach(r => {
      console.log(`   - "${r.title}"`);
      console.log(`     Public PDF: ${r.fileUrl.substring(0, 100)}...`);
      console.log(`     PDF size: ${(r.fileSize/1024).toFixed(1)} KB`);
      if (r.originalFileKey) {
        console.log(`     🌟 ORIGINAL (${r.originalFormat}): ${r.originalFileKey.substring(0, 100)}...`);
        console.log(`     Original size: ${r.originalFileSize} bytes`);
      } else {
        console.log(`     Original: (none, PDF only)`);
      }
      console.log(`     Slug: ${r.slug}`);
    });
    console.log();
  }
  
  await p.$disconnect();
})();

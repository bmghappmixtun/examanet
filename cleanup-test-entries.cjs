const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Find resources created during test pilots (originalFileName or by filter)
  const tests = await p.resource.findMany({
    where: {
      OR: [
        { title: { startsWith: 'Test' } },
        { title: { contains: 'Tool' } },
        { title: { contains: 'conv-test' } },
      ]
    },
    select: { id: true, teacherId: true, title: true }
  });
  
  console.log(`Found ${tests.length} test entries to clean`);
  
  for (const t of tests) {
    const tf = await p.teacherFile.findFirst({ where: { resourceId: t.id } });
    if (tf) await p.teacherFile.delete({ where: { id: tf.id } });
    await p.resource.delete({ where: { id: t.id } });
    console.log(`Deleted: ${t.title}`);
  }
  
  // Check for orphaned teachers
  const teachers = await p.user.findMany({
    where: { email: { contains: 'examanet-import.local' } },
    select: { id: true, email: true }
  });
  for (const t of teachers) {
    const res = await p.resource.count({ where: { teacherId: t.id } });
    if (res === 0) {
      await p.user.delete({ where: { id: t.id } });
      console.log(`Deleted orphan teacher: ${t.email}`);
    }
  }
  
  await p.$disconnect();
})();

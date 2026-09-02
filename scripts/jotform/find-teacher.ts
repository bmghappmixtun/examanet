import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const teachers = await p.user.findMany({
    where: {
      role: 'TEACHER',
      OR: [
        { firstName: { contains: 'GHARBI' } },
        { firstName: { contains: 'Gharbi' } },
        { firstName: { contains: 'gharbi' } },
        { lastName: { contains: 'GHARBI' } },
        { lastName: { contains: 'Gharbi' } },
        { lastName: { contains: 'gharbi' } },
        { lastName: { contains: 'RIDHA' } },
        { lastName: { contains: 'ridha' } },
        { email: 'mounibtasnim@yahoo.fr' },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, isVerifiedTeacher: true }
  });
  console.log(`Found ${teachers.length} teachers:`);
  for (const t of teachers) {
    const fullName = `${t.firstName || ''} ${t.lastName || ''}`.trim();
    console.log(`  ${t.id} | ${fullName} | ${t.email || 'no email'} | verified=${t.isVerifiedTeacher} active=${t.isActive}`);
  }
  await p.$disconnect();
})();

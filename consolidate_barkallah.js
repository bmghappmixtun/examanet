const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const dbMatch = env.match(/DATABASE_URL="?([^"\n]+)"?/);
if (dbMatch) process.env.DATABASE_URL = dbMatch[1];

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const fromUser = await p.user.findFirst({ where: { email: 'import.lotfi.Barkallah@examanet-import.local' } });
  const toUser = await p.user.findFirst({ where: { email: 'import.barkallah.Lotfi@examanet-import.local' } });
  
  if (fromUser && toUser) {
    const r = await p.resource.updateMany({
      where: { teacherId: fromUser.id },
      data: { teacherId: toUser.id }
    });
    const tf = await p.teacherFile.updateMany({
      where: { teacherId: fromUser.id },
      data: { teacherId: toUser.id }
    });
    await p.user.delete({ where: { id: fromUser.id } });
    console.log('Transferred: ' + r.count + ' resources, ' + tf.count + ' files');
  } else {
    console.log('Skip: from=' + !!fromUser + ' to=' + !!toUser);
  }
  
  await p.$disconnect();
})();

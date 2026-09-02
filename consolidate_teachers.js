const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const dbMatch = env.match(/DATABASE_URL="?([^"\n]+)"?/);
if (dbMatch) process.env.DATABASE_URL = dbMatch[1];

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Consolidate maps: orphan email -> main email
  const consolidations = [
    { from: 'import.fraoua.Bechir@examanet-import.local', to: 'import.bechir.Fraoua@examanet-import.local', toFirst: 'Bechir', toLast: 'Fraoua' },
    { from: 'import.ibrahim.Rahali@examanet-import.local', to: 'import.rahali.Ibrahim@examanet-import.local', toFirst: 'Rahali', toLast: 'Ibrahim' },
    { from: 'import.safwan.Smida@examanet-import.local', to: 'import.smida.Safwan@examanet-import.local', toFirst: 'Smida', toLast: 'Safwan' },
  ];
  
  for (const c of consolidations) {
    const fromUser = await p.user.findFirst({ where: { email: c.from } });
    if (!fromUser) {
      console.log('Orphan not found: ' + c.from);
      continue;
    }
    
    const toUser = await p.user.findFirst({ where: { email: c.to } });
    if (!toUser) {
      console.log('Main not found: ' + c.to);
      continue;
    }
    
    // Transfer all resources
    const result = await p.resource.updateMany({
      where: { teacherId: fromUser.id },
      data: { teacherId: toUser.id }
    });
    
    // Transfer teacher files
    const tfResult = await p.teacherFile.updateMany({
      where: { teacherId: fromUser.id },
      data: { teacherId: toUser.id }
    });
    
    // Delete orphan user
    await p.user.delete({ where: { id: fromUser.id } });
    
    console.log(c.from + ' → ' + c.to + ': ' + result.count + ' resources, ' + tfResult.count + ' teacher files transferred');
  }
  
  await p.$disconnect();
})();

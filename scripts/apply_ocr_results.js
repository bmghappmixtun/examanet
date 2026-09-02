require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');
const p = new PrismaClient({ log: ['error'] });

(async () => {
  const results = JSON.parse(fs.readFileSync('/tmp/ocr_21_results.json', 'utf-8'));
  const successful = results.filter(r => r.success);
  console.log(`Applying ${successful.length} successful results...`);
  
  let applied = 0;
  for (const r of successful) {
    const method = r.method || 'pypdf';
    const model = `gpt-4o-mini-${method === 'ocr' ? 'ocr' : 'late-v1'}`;
    
    try {
      await p.resourceMetadata.upsert({
        where: { resourceId: r.id },
        create: { resourceId: r.id, keyInsights: r.exercises, modelUsed: model },
        update: { keyInsights: r.exercises, modelUsed: model },
      });
      applied++;
      console.log(`  ✓ #${r.num}: ${r.exercises.length} exercises`);
    } catch (e) {
      console.error(`  ✗ #${r.num}: ${e.message}`);
    }
  }
  console.log(`Applied: ${applied}/${successful.length}`);
  await p.$disconnect();
})();

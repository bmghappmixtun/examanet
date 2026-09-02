require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const fs = require('fs');

const p = new PrismaClient({ log: ['error'] });
const payload = JSON.parse(fs.readFileSync('/workspace/edutunisie/scripts/fr_lycee_payload.json', 'utf-8'));

async function main() {
  let updated = 0;
  let errors = 0;
  for (const item of payload.payload) {
    if (!item.description) continue;
    try {
      await p.resource.update({
        where: { id: item.resourceId },
        data: {
          description: item.description.substring(0, 2000),
          // descriptionGeneratedAt: new Date(),
        },
      });
      updated++;
    } catch (err) {
      errors++;
      console.error(`#${item.resourceId}: ${err.message}`);
    }
  }
  console.log(`Updated: ${updated}, Errors: ${errors}`);
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config({ path: '/workspace/edutunisie/.env.local' });
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const ids = [7680, 7681, 7795, 12868, 13138, 13233, 13247];
  const r = await p.$queryRaw`
    SELECT r."numericId"::int, r.title, r."hasCorrection",
      rc."fullText" as text
    FROM "Resource" r
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE r."numericId" = ANY(${ids})
  `;
  for (const x of r) {
    console.log('\n=== #' + x.numericId + ' | hasCorrection=' + x.hasCorrection + ' ===');
    console.log('Title: ' + x.title);
    const t = x.text || '';
    console.log('Text length: ' + t.length);
    console.log('Last 800 chars:');
    console.log('  ' + t.slice(-800).replace(/\s+/g, ' ').slice(0, 800));
  }
  await p.$disconnect();
}
main().catch(console.error);

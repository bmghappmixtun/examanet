import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config({ path: '/workspace/edutunisie/.env.local' });
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const ids = [15452, 15454, 15455, 15456, 15457];
const resources = await p.resource.findMany({
  where: { numericId: { in: ids } },
  select: { id: true, numericId: true, title: true, fileKey: true, fileUrl: true, fileSize: true, pageCount: true },
});

for (const r of resources) {
  console.log(`#${r.numericId} (${r.id}): ${r.title.substring(0, 60)}`);
  console.log(`  fileKey: ${r.fileKey}`);
  console.log(`  fileSize: ${r.fileSize}, pageCount: ${r.pageCount}`);
}

await p.$disconnect();

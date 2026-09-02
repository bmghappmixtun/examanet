import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const ar = await p.resource.findMany({
  where: {
    subject: { slug: 'arabe' },
    title: { contains: 'ables' }
  },
  include: { metadata: true }
});
console.log('Fables issue:');
for (const r of ar) {
  console.log(`  #${r.id}:`);
  console.log(`    title: ${r.title}`);
  console.log(`    generalSubject: ${r.metadata?.generalSubject || 'null'}`);
}
await p.$disconnect();

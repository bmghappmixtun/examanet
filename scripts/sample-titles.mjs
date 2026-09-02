import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const AR_SUBJECTS = ['arabe', 'philosophie', 'pensee-islamique', 'histoire', 'geographie', 'histoire-geographie'];
const resources = await p.resource.findMany({
  where: {
    subject: { slug: { in: AR_SUBJECTS } },
    class: { slug: { in: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'] } },
    status: 'PUBLISHED',
  },
  include: { subject: { select: { slug: true } } },
  orderBy: { numericId: 'asc' },
  take: 20,
});
for (const r of resources) {
  console.log(`[${r.subject.slug}] ${r.title}`);
}
await p.$disconnect();

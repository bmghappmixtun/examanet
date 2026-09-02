import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const ar = await p.resource.findMany({
  where: { subject: { slug: 'arabe' }, title: { contains: 'ables' } },
  include: { metadata: true }
});
console.log(`Found ${ar.length} files with 'fables' issue`);
for (const r of ar) {
  // Clean the generalSubject
  const oldGS = r.metadata?.generalSubject;
  if (oldGS && oldGS.includes('فables')) {
    // Replace 'فables للافونتين' or 'فables لافونتين' with just 'لافونتين'
    // Also handle 'نص أدبي - لافونتين' as the clean version
    const newGS = oldGS
      .replace(/فables\s*ل(لافونتين|افونتين)/g, 'لافونتين')
      .replace(/فables\s/g, '') // Remove any remaining 'fables '
      .trim();
    console.log(`  #${r.id}: "${oldGS}" → "${newGS}"`);
    if (newGS !== oldGS) {
      await p.resourceMetadata.update({
        where: { resourceId: r.id },
        data: { generalSubject: newGS }
      });
      console.log(`    ✅ Updated`);
    }
  }
}
await p.$disconnect();

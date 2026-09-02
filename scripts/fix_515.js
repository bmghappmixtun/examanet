require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });

(async () => {
  console.log('=== BEFORE ===');
  const before = await p.resource.findFirst({
    where: { numericId: 515 },
    select: {
      title: true, slug: true, schoolType: true,
      subject: { select: { slug: true, nameFr: true } },
      class: { select: { slug: true, nameFr: true, level: { select: { slug: true } } } },
    },
  });
  console.log(JSON.stringify(before, null, 2));

  // Get correct IDs
  const math = await p.subject.findFirst({ where: { slug: 'mathematiques' } });
  const cls = await p.class.findFirst({ where: { slug: '8eme' } });

  // Get resource ID
  const file = await p.resource.findFirst({ where: { numericId: 515 } });
  const oldSlug = file.slug;
  const oldTitle = file.title;

  // 1. Update subject + class + schoolType
  await p.resource.update({
    where: { id: file.id },
    data: {
      subjectId: math.id,
      classId: cls.id,
      schoolType: 'PUBLIC', // Collège default (8eme année de base = collège)
    },
  });

  // 2. Delete the wrong AI metadata (extracted as physique)
  await p.resourceMetadata.deleteMany({ where: { resourceId: file.id } });
  await p.resourceSummary.deleteMany({ where: { resourceId: file.id } });
  // Also clear Resource.tags (the AI-populated ones for physique)
  await p.resource.update({
    where: { id: file.id },
    data: { tags: null },
  });

  // 3. Build new title
  const newTitle = 'Devoir de Synthèse N°1 - Mathématiques - 8ème année de base (2020-2021)';

  // 4. Build new slug (kebab-case, no accents, 80 chars max)
  const newSlug = 'devoir-de-synthese-n-1-mathematiques-8eme-annee-de-base-2020-2021-515'.substring(0, 80);

  await p.resource.update({
    where: { id: file.id },
    data: {
      title: newTitle,
      slug: newSlug,
    },
  });

  console.log('\n=== AFTER ===');
  const after = await p.resource.findFirst({
    where: { numericId: 515 },
    select: {
      title: true, slug: true, schoolType: true,
      subject: { select: { slug: true, nameFr: true } },
      class: { select: { slug: true, nameFr: true, level: { select: { slug: true } } } },
    },
  });
  console.log(JSON.stringify(after, null, 2));

  console.log('\n=== CHANGES ===');
  console.log(`subject:    ${before.subject.slug} → ${after.subject.slug}`);
  console.log(`class:      ${before.class.slug} → ${after.class.slug} (${after.class.level.slug})`);
  console.log(`schoolType: ${before.schoolType} → ${after.schoolType}`);
  console.log(`title:      ${oldTitle}`);
  console.log(`          → ${newTitle}`);
  console.log(`slug:       ${oldSlug}`);
  console.log(`          → ${newSlug}`);

  await p.$disconnect();
})();

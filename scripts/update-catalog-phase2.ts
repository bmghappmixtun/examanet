/**
 * Phase 2: Catalog renames
 *
 * 2a) Arts Plastiques → Éducation artistique
 *     - Migrate resources from old subject to new (already created in Phase 1)
 *     - Delete old subject
 *
 * 2b) Informatique section → Sciences de l'informatique
 *     - Rename the slug of all "info" sections (4 classes × 1 = 4 sections)
 *     - Resources keep their sectionId reference (no migration needed)
 *
 * Idempotent: safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function phase2a_renameSubject() {
  console.log('\n📚 Phase 2a: Arts Plastiques → Éducation artistique\n');

  const oldSubject = await prisma.subject.findUnique({ where: { slug: 'arts' } });
  const newSubject = await prisma.subject.findUnique({ where: { slug: 'education-artistique' } });

  if (!oldSubject) {
    console.log('⏭  Old subject "arts" not found - already migrated');
    return;
  }
  if (!newSubject) {
    console.log('❌ New subject "education-artistique" not found - run Phase 1 first');
    return;
  }

  // Count resources that need migration
  const resourceCount = await prisma.resource.count({
    where: { subjectId: oldSubject.id },
  });
  console.log(`📦 Found ${resourceCount} resources with old subject`);

  if (resourceCount > 0) {
    // Update all resources to use the new subject
    const updated = await prisma.resource.updateMany({
      where: { subjectId: oldSubject.id },
      data: { subjectId: newSubject.id },
    });
    console.log(`✅ Migrated ${updated.count} resources to new subject`);

    // Verify
    const remaining = await prisma.resource.count({
      where: { subjectId: oldSubject.id },
    });
    if (remaining > 0) {
      console.log(`⚠️  Still ${remaining} resources with old subject (something wrong)`);
      return;
    }
  }

  // Delete old subject
  await prisma.subject.delete({ where: { id: oldSubject.id } });
  console.log(`🗑️  Deleted old subject "arts"`);

  // Verify new subject is intact
  const final = await prisma.subject.findUnique({ where: { slug: 'education-artistique' } });
  if (final) {
    const totalResources = await prisma.resource.count({ where: { subjectId: final.id } });
    console.log(`✅ New subject has ${totalResources} resources`);
  }
}

async function phase2b_renameSection() {
  console.log('\n🎓 Phase 2b: Informatique section → Sciences de l\'informatique\n');

  const oldSections = await prisma.section.findMany({ where: { slug: 'info' } });

  if (oldSections.length === 0) {
    console.log('⏭  No "info" sections found - already renamed');
    return;
  }

  console.log(`📦 Found ${oldSections.length} sections to rename`);

  // Check if any 'sciences-informatique' section already exists for these classes
  for (const old of oldSections) {
    const existing = await prisma.section.findFirst({
      where: {
        classId: old.classId,
        slug: 'sciences-informatique',
      },
    });
    if (existing) {
      console.log(`  ⚠️  classId=${old.classId} already has sciences-informatique, deleting duplicate 'info'`);
      // Move any resources referencing the old one to the new one
      await prisma.resource.updateMany({
        where: { sectionId: old.id },
        data: { sectionId: existing.id },
      });
      await prisma.section.delete({ where: { id: old.id } });
      continue;
    }

    // Just rename
    await prisma.section.update({
      where: { id: old.id },
      data: {
        slug: 'sciences-informatique',
        nameFr: 'Sciences de l\'informatique',
        nameAr: 'علوم الإعلامية',
      },
    });
    console.log(`  ✅ Renamed section in class ${old.classId}`);
  }

  // Verify
  const newSections = await prisma.section.findMany({ where: { slug: 'sciences-informatique' } });
  console.log(`📊 Total 'sciences-informatique' sections: ${newSections.length}`);
}

async function main() {
  console.log('🚀 Phase 2: Catalog renames\n');

  await phase2a_renameSubject();
  await phase2b_renameSection();

  console.log('\n✅ Phase 2 complete!');
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Phase 3: Add Sport section to 3ème and 4ème année secondaire ONLY
 *
 * (User decision: sport is only offered as a BAC section in Tunisia,
 * not for 1ère and 2ème année - the source officiels don't list it for those levels)
 *
 * Idempotent: safe to re-run
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🏃 Phase 3: Add Sport section (3ème + 4ème année)\n');

  // Get 3ème and 4ème année classes
  const targetClasses = await prisma.class.findMany({
    where: {
      OR: [{ slug: '3eme-secondaire' }, { slug: '4eme-secondaire' }],
    },
  });

  if (targetClasses.length === 0) {
    console.log('❌ Classes 3ème-secondaire / 4eme-secondaire not found');
    return;
  }

  console.log(`🎯 Found ${targetClasses.length} target classes:`);
  targetClasses.forEach((c) => console.log(`   - ${c.nameFr} (${c.slug})`));

  let added = 0;
  let skipped = 0;

  for (const cls of targetClasses) {
    // Check if Sport already exists for this class
    const existing = await prisma.section.findFirst({
      where: { classId: cls.id, slug: 'sport' },
    });
    if (existing) {
      console.log(`⏭  Sport section already exists for ${cls.nameFr}`);
      skipped++;
      continue;
    }

    await prisma.section.create({
      data: {
        classId: cls.id,
        slug: 'sport',
        nameFr: 'Sport',
        nameAr: 'الرياضة',
      },
    });
    console.log(`✅ Added Sport section to ${cls.nameFr}`);
    added++;
  }

  console.log(`\n📊 Résultat: ${added} ajoutées, ${skipped} déjà existantes`);

  // Final verification
  const allSections = await prisma.section.findMany({
    where: { slug: 'sport' },
    include: { class: true },
  });
  console.log(`\n🏃 Sport sections (${allSections.length}):`);
  allSections.forEach((s) => console.log(`   - ${s.class.nameFr}: ${s.nameFr} (${s.slug})`));
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

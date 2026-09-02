/**
 * Phase 1: Add 11 new subjects to the platform catalog
 *
 * Source: Official Tunisian curriculum (devoir.tn, edunet.tn, 9anoun.tn)
 *
 * Idempotent: safe to run multiple times (skips existing slugs)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// New subjects to add (with FR + AR names + icon/color)
const NEW_SUBJECTS = [
  // Section-specific (Sciences de l'informatique)
  {
    slug: 'algo-prog',
    nameFr: 'Algorithme et programmation',
    nameAr: 'الخوارزميات والبرمجة',
    icon: '💻',
    color: '#8B5CF6',
    category: 'si-specific',
    description: 'Matière spécifique à la section Sciences de l\'informatique (3ème + 4ème année)',
  },
  {
    slug: 'tic',
    nameFr: 'TIC',
    nameAr: 'تكنولوجيا المعلومات والاتصال',
    icon: '🌐',
    color: '#0EA5E9',
    category: 'si-specific',
    description: 'Technologies de l\'Information et de la Communication - section SI',
  },
  {
    slug: 'systeme-exploitation-reseaux',
    nameFr: 'Système d\'exploitation et réseaux informatiques',
    nameAr: 'أنظمة التشغيل والشبكات',
    icon: '🖥️',
    color: '#1E40AF',
    category: 'si-specific',
    description: 'Matière spécifique 3ème année section Sciences de l\'informatique',
  },
  {
    slug: 'bases-donnees',
    nameFr: 'Bases de données',
    nameAr: 'قواعد البيانات',
    icon: '🗄️',
    color: '#7C3AED',
    category: 'si-specific',
    description: 'Matière spécifique 4ème année section Sciences de l\'informatique',
  },
  {
    slug: 'sciences-informatique-matiere',
    nameFr: 'Sciences de l\'informatique',
    nameAr: 'علوم الإعلامية',
    icon: '🖥️',
    color: '#2563EB',
    category: 'si-specific',
    description: 'Matière spécifique 4ème année Mathématiques',
  },

  // Common subjects (collège + lycée)
  {
    slug: 'education-civique',
    nameFr: 'Éducation civique',
    nameAr: 'التربية المدنية',
    icon: '🏛️',
    color: '#DC2626',
    category: 'common',
    description: 'Enseignée au primaire, collège et 2ème année lycée',
  },
  {
    slug: 'education-islamique',
    nameFr: 'Éducation islamique',
    nameAr: 'التربية الإسلامية',
    icon: '🕌',
    color: '#059669',
    category: 'common',
    description: 'Enseignée au primaire et 2ème année lycée',
  },
  {
    slug: 'pensee-islamique',
    nameFr: 'Pensée islamique',
    nameAr: 'التفكير الإسلامي',
    icon: '📿',
    color: '#10B981',
    category: 'common',
    description: 'Enseignée en 3ème et 4ème année (lycée)',
  },
  {
    slug: '3eme-langue',
    nameFr: '3ème langue',
    nameAr: 'اللغة الثالثة',
    icon: '🗣️',
    color: '#F59E0B',
    category: 'lycée',
    description: 'LV2 au lycée : Italien, Espagnol, Allemand (3ème + 4ème année)',
  },
  {
    slug: 'education-artistique',
    nameFr: 'Éducation artistique',
    nameAr: 'التربية التشكيلية',
    icon: '🎨',
    color: '#EC4899',
    category: 'lycée',
    description: 'Arts plastiques (3ème année Sc + EG)',
  },
  {
    slug: 'histoire-geographie',
    nameFr: 'Histoire-Géographie',
    nameAr: 'التاريخ والجغرافيا',
    icon: '🌍',
    color: '#6366F1',
    category: 'bac',
    description: 'Matière unique 4ème année Économie-Gestion',
  },
];

async function main() {
  console.log(`🚀 Phase 1: Adding ${NEW_SUBJECTS.length} new subjects...\n`);

  let added = 0;
  let skipped = 0;

  for (const subject of NEW_SUBJECTS) {
    const existing = await prisma.subject.findUnique({ where: { slug: subject.slug } });
    if (existing) {
      console.log(`⏭  ${subject.nameFr} (${subject.slug}) - already exists`);
      skipped++;
      continue;
    }

    // Get max order + 1
    const maxOrder = await prisma.subject.aggregate({ _max: { order: true } });
    const order = (maxOrder._max.order || 0) + 1;

    await prisma.subject.create({
      data: {
        slug: subject.slug,
        nameFr: subject.nameFr,
        nameAr: subject.nameAr,
        icon: subject.icon,
        color: subject.color,
        order,
      },
    });
    console.log(`✅ ${subject.icon}  ${subject.nameFr.padEnd(45)} (${subject.slug})`);
    added++;
  }

  console.log(`\n📊 Résultat: ${added} ajoutées, ${skipped} déjà existantes`);
  console.log(`📚 Total dans le catalogue: ${await prisma.subject.count()} matières`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

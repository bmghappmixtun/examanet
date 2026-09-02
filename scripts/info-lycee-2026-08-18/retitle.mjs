#!/usr/bin/env node
/**
 * Reformate les titres Informatique lycée au format Examanet (2026-08-18)
 *
 * Format cible: {Type} N°X - {Sujet} - {Classe} - Section {Section} ({year}) : {Topic}
 *
 * - Remplace "Informatique" par le vrai nom de matière (algo-prog, bases-donnees, tic, systeme-exploitation-reseaux)
 * - Remplace "8ème" par "3AS/4AS" + section
 * - Garde le generalSubject après ":" (déjà ajouté par process.mjs)
 * - Régénère le slug
 *
 * Usage:
 *   node retitle.mjs [--dry-run] [--only-missing] [--limit=N]
 */

import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_MISSING = args.includes('--only-missing');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.slice(8)) : null;

const MAX_TITLE_LENGTH = 200;
const MAX_SLUG_LENGTH = 80;

console.log('📝 Reformateur de titres Informatique lycée (2026-08-18)');
console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'COMMIT'}${ONLY_MISSING ? ' (only-missing)' : ''}${LIMIT ? ` (limit: ${LIMIT})` : ''}`);

// =============================================================================
// Slugify (matches lib/slugify.ts)
// =============================================================================
function properSlugify(text, maxLen) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, maxLen)
    .replace(/-+$/, '');
}

// =============================================================================
// DB setup
// =============================================================================
const prisma = new PrismaClient();

// Map slug -> nom de matière Examanet
const SUBJECT_NAMES = {
  'informatique': 'Informatique',
  'algo-prog': 'Algorithmique et Programmation',
  'bases-donnees': 'Bases de Données',
  'tic': 'TIC',
  'systeme-exploitation-reseaux': 'Système d\'exploitation et réseaux',
};

// Map class slug -> libellé court
const CLASS_LABELS = {
  '1ere-secondaire': '1AS',
  '2eme-secondaire': '2AS',
  '3eme-secondaire': '3AS',
  '4eme-secondaire': '4AS',
};

// Map section slug -> libellé
const SECTION_LABELS = {
  'sciences-informatique': 'Sciences de l\'informatique',
  'sciences': 'Sciences',
  'maths': 'Mathématiques',
  'lettres': 'Lettres',
  'eco-gestion': 'Économie-Gestion',
  'eco-services': 'Économie et services',
  'technique': 'Technique',
  'sciences-experimentales': 'Sciences Expérimentales',
  'sciences-techniques': 'Sciences Techniques',
  'technologies-informatique': 'Technologies de l\'informatique',
  'sport': 'Sport',
};

// =============================================================================
// Build new title
// =============================================================================
function buildNewTitle(currentTitle, subject, classSlug, sectionSlug, year, gs) {
  // Try to extract the "Type N°X" prefix from current title
  // Patterns: "Devoir de Contrôle N°1 - ...", "Série d'exercices N°2 - ...", "Cours - ...", etc.
  let prefix = '';
  const prefixMatch = currentTitle.match(/^([A-Za-zÀ-ÿ\s']+(?:de|d')\s+(?:Contrôle|Synthèse|Maison|Exercices?|Cours|Révision|Bac Blanc|Série)\s*(?:N°\s*\d+)?)\s*-/);
  if (prefixMatch) {
    prefix = prefixMatch[1].trim();
  } else {
    // Try simpler pattern: "Devoir ... N°X" or "Série ... N°X"
    const simpleMatch = currentTitle.match(/^((?:Devoir|Série|Cours|Révision)\s*[^N-]*?(?:N°\s*\d+)?)\s*-/);
    if (simpleMatch) {
      prefix = simpleMatch[1].trim();
    } else {
      // Last resort: take first 3 words
      prefix = currentTitle.split(/[\s-]/).slice(0, 3).join(' ');
    }
  }

  const subjectName = SUBJECT_NAMES[subject] || 'Informatique';
  const classLabel = CLASS_LABELS[classSlug] || classSlug;
  const sectionLabel = SECTION_LABELS[sectionSlug] || '';
  const yearStr = year || 'inconnue';

  let newTitle = `${prefix} - ${subjectName} - ${classLabel}`;
  if (sectionLabel && sectionLabel !== classLabel) {
    newTitle += ` - ${sectionLabel}`;
  }
  newTitle += ` - (${yearStr})`;
  if (gs) {
    newTitle += ` : ${gs}`;
  }
  // Truncate if needed
  if (newTitle.length > MAX_TITLE_LENGTH) {
    newTitle = newTitle.slice(0, MAX_TITLE_LENGTH - 1) + '…';
  }
  return newTitle;
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  const slugs = ['informatique', 'algo-prog', 'bases-donnees', 'tic', 'systeme-exploitation-reseaux'];
  // Filter to lycée only (1AS, 2AS, 3AS, 4AS)
  const where = {
    subject: { slug: { in: slugs } },
    class: { slug: { in: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'] } },
  };
  // Only files with metadata (so we have the AI data)
  if (ONLY_MISSING) {
    where.metadata = { NOT: { generalSubject: null } };
    where.title = { contains: 'Informatique -' };
  }

  const resources = await prisma.resource.findMany({
    where,
    include: {
      subject: true,
      class: { include: { level: true } },
      section: true,
      metadata: true,
    },
    orderBy: { numericId: 'asc' },
    take: LIMIT || undefined,
  });
  console.log(`📦 ${resources.length} fichiers lycée à re-titrer`);

  let success = 0, errors = 0, skipped = 0;
  const changes = [];

  for (const r of resources) {
    try {
      // Skip if no metadata (no AI data to work with)
      if (!r.metadata?.generalSubject) {
        skipped++;
        continue;
      }

      const subjectSlug = r.subject.slug;
      const classSlug = r.class?.slug;
      const sectionSlug = r.section?.slug;
      const year = r.year || r.metadata.year;
      const gs = r.metadata.generalSubject;

      // Skip if title already in good format
      if (r.title.includes(`${SUBJECT_NAMES[subjectSlug]} - ${CLASS_LABELS[classSlug]}`)) {
        skipped++;
        continue;
      }

      const newTitle = buildNewTitle(r.title, subjectSlug, classSlug, sectionSlug, year, gs);
      const newSlug = properSlugify(newTitle, MAX_SLUG_LENGTH) + '-' + r.numericId;

      if (newTitle === r.title) {
        skipped++;
        continue;
      }

      changes.push({
        id: r.numericId,
        old: r.title,
        new: newTitle,
        slug: newSlug,
      });

      if (!DRY_RUN) {
        await prisma.resource.update({
          where: { id: r.id },
          data: { title: newTitle, slug: newSlug },
        });
      }
      success++;
    } catch (e) {
      errors++;
      console.log(`   ❌ #${r.numericId}: ${e.message.substring(0, 100)}`);
    }
  }

  console.log(`\n📊 RÉSUMÉ:`);
  console.log(`   ✅ Re-titrés: ${success}`);
  console.log(`   ⏭️  Skipped:  ${skipped}`);
  console.log(`   ❌ Errors:   ${errors}`);

  if (changes.length > 0 && changes.length <= 30) {
    console.log(`\n📋 CHANGES (${changes.length}):`);
    for (const c of changes) {
      console.log(`   #${c.id}:`);
      console.log(`     OLD: ${c.old.substring(0, 100)}`);
      console.log(`     NEW: ${c.new.substring(0, 100)}`);
    }
  } else if (changes.length > 30) {
    console.log(`\n📋 Sample of ${changes.length} changes:`);
    for (const c of changes.slice(0, 10)) {
      console.log(`   #${c.id}:`);
      console.log(`     OLD: ${c.old.substring(0, 80)}`);
      console.log(`     NEW: ${c.new.substring(0, 80)}`);
    }
    console.log(`   ... and ${changes.length - 10} more`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error('💥 Fatal:', e);
    prisma.$disconnect();
    process.exit(1);
  });

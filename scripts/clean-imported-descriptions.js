#!/usr/bin/env node
/**
 * clean-imported-descriptions.js
 *
 * Clean up descriptions and titles of resources imported from tunisiecollege.net
 * - Remove " - GHARBI RIDHA" suffix from titles
 * - Set description to null (since attribution is no longer needed)
 *
 * These resources are now properly owned by Mr GHARBI RIDHA's account,
 * so the attribution text in title/description is redundant.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEACHER_EMAIL = 'gharbi.ridha@examanet.com';

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('🧹 Clean imported descriptions');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // Get all resources owned by GHARBI RIDHA
  const resources = await prisma.resource.findMany({
    where: { teacher: { email: TEACHER_EMAIL } },
    select: { id: true, title: true, description: true }
  });

  console.log(`Found ${resources.length} resources to clean`);

  let titleChanged = 0;
  let descChanged = 0;

  for (const r of resources) {
    const updates = {};

    // Clean title - remove " - GHARBI RIDHA" or " - Mr GHARBI RIDHA" suffix
    const newTitle = r.title
      .replace(/\s*-\s*(Mr\s+)?Gharbi\s+Ridha\s*$/i, '')
      .replace(/\s*-\s*(Mr\s+)?GHARBI\s+RIDHA\s*$/i, '')
      .trim();
    if (newTitle !== r.title) {
      updates.title = newTitle;
      titleChanged++;
    }

    // Clean description - remove "Ressource partagée par..." and "🔗 Source: ..." and "📅 Année: ..."
    if (r.description) {
      const cleaned = r.description
        .replace(/📚\s*Ressource partagée par[^\n]*\n?/gi, '')
        .replace(/🔗\s*Source:\s*[^\n]*\n?/gi, '')
        .replace(/📅\s*Année:\s*[^\n]*\n?/gi, '')
        .trim();
      const newDesc = cleaned === '' ? null : cleaned;
      if (newDesc !== r.description) {
        updates.description = newDesc;
        descChanged++;
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.resource.update({
        where: { id: r.id },
        data: updates
      });
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`✓ Titles cleaned: ${titleChanged}`);
  console.log(`✓ Descriptions cleaned: ${descChanged}`);
  console.log(`✓ Total resources: ${resources.length}`);
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // Show samples
  console.log('📋 Sample cleaned resources:');
  const samples = await prisma.resource.findMany({
    where: { teacher: { email: TEACHER_EMAIL } },
    take: 5,
    select: { title: true, description: true },
    orderBy: { createdAt: 'desc' }
  });
  samples.forEach(s => {
    console.log(`   • ${s.title}`);
    console.log(`     Desc: ${s.description || '(none)'}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
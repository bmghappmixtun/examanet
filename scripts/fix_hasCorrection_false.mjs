import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
config({ path: '/workspace/edutunisie/.env.local' });
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/['']/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

async function fixFile(numericId) {
  const r = await p.resource.findUnique({ where: { numericId } });
  if (!r) {
    console.log(`#${numericId} NOT FOUND`);
    return;
  }
  // Remove "(avec corrigé)" from title
  const newTitle = r.title.replace(/\s*\(avec corrig[é]\)\s*$/i, '').trim();
  const newSlug = `${slugify(newTitle)}-${numericId}`;
  console.log(`\n#${numericId}:`);
  console.log(`  OLD title: ${r.title}`);
  console.log(`  NEW title: ${newTitle}`);
  console.log(`  OLD slug:  ${r.slug}`);
  console.log(`  NEW slug:  ${newSlug}`);

  await p.resource.update({
    where: { id: r.id },
    data: {
      hasCorrection: false,
      title: newTitle,
      slug: newSlug,
    },
  });
  console.log('  ✓ Updated');
}

async function main() {
  // Fix #13138 (the user confirmed no correction)
  await fixFile(13138);
  await p.$disconnect();
}
main().catch(console.error);

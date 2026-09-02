import fs from 'fs';
import path from 'path';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}
loadEnv('/workspace/edutunisie/.env.local');
loadEnv('/workspace/edutunisie/.env');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

const RESULTS_DIR = '/workspace/imports/seo_results_v3';
const SOURCE = 'template-v3-multilingual';

async function main() {
  const allFiles = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('chunk_') && f.endsWith('.json'))
    .sort();
  
  console.log(`[apply] Found ${allFiles.length} chunks`);
  
  let updated = 0, skipped = 0, errors = 0;
  
  for (const file of allFiles) {
    const fullPath = path.join(RESULTS_DIR, file);
    const items = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    
    for (const item of items) {
      if (!item.description || !item.target_lang) {
        skipped++;
        continue;
      }
      try {
        await prisma.resource.update({
          where: { id: item.id },
          data: {
            description: item.description,
            metaDescription: item.metaDescription,
            descriptionSource: SOURCE,
            descriptionGeneratedAt: new Date(),
            language: item.target_lang,
          },
        });
        updated++;
        if (updated % 100 === 0) {
          console.log(`  Updated ${updated}/${allFiles.length * 50}...`);
        }
      } catch (e) {
        if (e.code === 'P2025') {
          skipped++;
        } else {
          console.error(`[apply] Error ${item.id}: ${e.message.slice(0, 100)}`);
          errors++;
        }
      }
    }
  }
  
  console.log(`\n[apply] ✅ Updated: ${updated}`);
  console.log(`[apply] ⏭️ Skipped: ${skipped}`);
  console.log(`[apply] ❌ Errors: ${errors}`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

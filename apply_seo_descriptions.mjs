// Load env FIRST before importing Prisma
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
console.log(`[apply] DATABASE_URL host: ${(process.env.DATABASE_URL || '').split('@').pop()?.split('/')[0]}`);

// Now import Prisma (after env is loaded)
const { PrismaClient } = await import('@prisma/client');

const prisma = new PrismaClient();

const RESULTS_DIR = '/workspace/imports/seo_results';
const SOURCE = 'agent-v2-multilingual';

async function main() {
  const args = process.argv.slice(2);
  const chunkFilter = args[0];

  const allFiles = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('chunk_') && f.endsWith('.json'))
    .sort();
  const files = chunkFilter
    ? allFiles.filter(f => f.match(new RegExp(chunkFilter.replace(/\*/g, '.*'))))
               .map(f => path.join(RESULTS_DIR, f))
    : allFiles.map(f => path.join(RESULTS_DIR, f));
  console.log(`[apply] Matched files: ${files.map(f => path.basename(f)).join(', ')}`);

  let updated = 0, skipped = 0, errors = 0;

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`[apply] Missing: ${file}`);
      continue;
    }
    const items = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`[apply] ${path.basename(file)}: ${items.length} items`);

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
      } catch (e) {
        if (e.code === 'P2025') {
          console.warn(`[apply] Not found: ${item.id}`);
          skipped++;
        } else {
          console.error(`[apply] Error ${item.id}: ${e.message}`);
          errors++;
        }
      }
    }
  }

  console.log(`[apply] Done. Updated=${updated} Skipped=${skipped} Errors=${errors}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

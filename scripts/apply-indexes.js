const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const sql = fs.readFileSync('scripts/setup-search-indexes.sql', 'utf8');
  // Split by semicolons but ignore empty statements and comments
  const statements = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  console.log(`Running ${statements.length} SQL statements...`);
  let success = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      await p.$executeRawUnsafe(stmt + ';');
      success++;
    } catch (e) {
      if (e.message.includes('already exists') || e.message.includes('does not exist')) {
        skipped++;
      } else {
        console.error('FAIL:', stmt.slice(0, 80) + '...');
        console.error('  →', e.message.slice(0, 100));
      }
    }
  }
  console.log(`✓ Done: ${success} success, ${skipped} skipped (already exists)`);
  await p.$disconnect();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

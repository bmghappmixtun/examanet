#!/usr/bin/env node
/**
 * Populate Resource.r2Key from cached R2 inventory
 * Runs ONLY on the CF isolated DB (examanet-cf-poc)
 * Idempotent: only updates rows where r2Key is NULL
 */
import { Client } from 'pg';
import { readFileSync } from 'fs';

const R2_INVENTORY_PATH = process.env.R2_INVENTORY_PATH || '/workspace/edutunisie/backups/r2-inventory-2026-08-24/pdf-prod-objects.json';

async function main() {
  console.log('[populate-r2key] Loading cached R2 inventory from', R2_INVENTORY_PATH);
  const items = JSON.parse(readFileSync(R2_INVENTORY_PATH, 'utf-8'));
  const r2Keys = new Set();
  for (const it of items) {
    if (it.Key && it.Key.startsWith('teacher-library/')) r2Keys.add(it.Key);
  }
  console.log(`[populate-r2key] R2 has ${r2Keys.size} teacher-library objects (from cache)`);

  const c = new Client({ connectionString: process.env.ISOLATED_DATABASE_URL });
  await c.connect();

  const VERCEL_CDN = 'kmy1h6us8l7bg7bg.public.blob.vercel-storage.com';
  console.log('[populate-r2key] Fetching Resources without r2Key...');
  const { rows } = await c.query(
    'SELECT id, "fileUrl" FROM "Resource" WHERE "r2Key" IS NULL AND "fileUrl" LIKE $1',
    [`%${VERCEL_CDN}%`]
  );
  console.log(`[populate-r2key] Found ${rows.length} Resources to check`);

  let updated = 0;
  let skipped = 0;
  const start = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const url = new URL(row.fileUrl);
      const path = url.pathname.replace(/^\//, '');
      if (r2Keys.has(path)) {
        await c.query(
          'UPDATE "Resource" SET "r2Key" = $1 WHERE id = $2 AND "r2Key" IS NULL',
          [path, row.id]
        );
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.warn(`  Bad URL: ${row.id}: ${e.message}`);
      skipped++;
    }
    if (i % 500 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[populate-r2key] ${i}/${rows.length} (updated ${updated}, skipped ${skipped}) in ${elapsed}s`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('');
  console.log(`[populate-r2key] DONE in ${elapsed}s`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (not in R2): ${skipped}`);

  const stats = await c.query('SELECT COUNT(*)::int as total, COUNT("r2Key")::int as with_r2key FROM "Resource"');
  console.log(`  Resource stats: ${stats.rows[0].with_r2key}/${stats.rows[0].total} have r2Key`);

  await c.end();
}

main().catch((e) => {
  console.error('[populate-r2key] FATAL:', e);
  process.exit(1);
});

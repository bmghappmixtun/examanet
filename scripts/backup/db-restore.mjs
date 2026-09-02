#!/usr/bin/env node
/**
 * Examanet Database Restore — from JSON backup
 *
 * Restores a database from the JSON dump produced by db-dump.mjs.
 * Use with EXTREME CAUTION: this will overwrite or insert data.
 *
 * Usage: node scripts/backup/db-restore.mjs --dir=backups/db/2026-07-09 [--table=user] [--mode=insert|upsert]
 *
 * Modes:
 *   - insert (default): createMany — fast, but fails on PK conflicts
 *   - upsert:          updateOrCreate — slower, but idempotent
 *
 *   - truncate:        DELETE all rows first, then insert (DANGEROUS)
 *
 * Examples:
 *   # Dry-run (no writes), just show what would be restored
 *   node scripts/backup/db-restore.mjs --dir=backups/db/2026-07-09 --dry-run
 *
 *   # Restore only the search_synonym table
 *   node scripts/backup/db-restore.mjs --dir=backups/db/2026-07-09 --table=search_synonym
 *
 *   # Full restore with truncate (DESTRUCTIVE)
 *   node scripts/backup/db-restore.mjs --dir=backups/db/2026-07-09 --mode=truncate
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const MODEL_MAP = {
  user: 'User',
  otp_code: 'OtpCode',
  session: 'Session',
  level: 'Level',
  class: 'Class',
  section: 'Section',
  subject: 'Subject',
  resource: 'Resource',
  teacher_file: 'TeacherFile',
  comment: 'Comment',
  rating: 'Rating',
  favorite: 'Favorite',
  view: 'View',
  download: 'Download',
  share: 'Share',
  report: 'Report',
  notification: 'Notification',
  newsletter: 'Newsletter',
  teacher_invitation: 'TeacherInvitation',
  setting: 'Setting',
  follow: 'Follow',
  conversation: 'Conversation',
  message: 'Message',
  contact_message: 'ContactMessage',
  search_synonym: 'SearchSynonym',
  search_log: 'SearchLog',
};

function parseArgs() {
  const args = { dir: null, table: null, mode: 'insert', dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--dir=')) args.dir = arg.slice(6);
    else if (arg.startsWith('--table=')) args.table = arg.slice(8);
    else if (arg.startsWith('--mode=')) args.mode = arg.slice(7);
    else if (arg === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function restoreTable(tableName, rows, mode, dryRun) {
  const modelName = MODEL_MAP[tableName];
  if (!modelName) {
    console.log(`  [skip] ${tableName} (no model mapping)`);
    return { skipped: true };
  }
  const model = prisma[modelName];
  if (!model) {
    console.log(`  [skip] ${tableName} (Prisma model ${modelName} not found)`);
    return { skipped: true };
  }

  if (dryRun) {
    console.log(`  [dry-run] ${tableName} → ${modelName}.createMany (${rows.length} rows)`);
    return { dryRun: true, count: rows.length };
  }

  if (mode === 'truncate') {
    console.log(`  [truncate] ${tableName} (DANGEROUS)`);
    await model.deleteMany({});
  }

  try {
    if (mode === 'upsert') {
      // PKey is 'id' for all our models
      let ok = 0;
      for (const row of rows) {
        try {
          await model.upsert({
            where: { id: row.id },
            create: row,
            update: row,
          });
          ok++;
        } catch (e) {
          // skip FK errors
        }
      }
      console.log(`  [upsert] ${tableName} → ${ok}/${rows.length} rows`);
      return { mode: 'upsert', ok, total: rows.length };
    } else {
      // createMany (insert mode) — skip duplicates
      try {
        const result = await model.createMany({ data: rows, skipDuplicates: true });
        console.log(`  [insert] ${tableName} → ${result.count}/${rows.length} rows`);
        return { mode: 'insert', ok: result.count, total: rows.length };
      } catch (e) {
        console.log(`  [err]   ${tableName}: ${e.message}`);
        return { error: e.message };
      }
    }
  } catch (e) {
    console.log(`  [err]   ${tableName}: ${e.message}`);
    return { error: e.message };
  }
}

async function main() {
  const args = parseArgs();
  if (!args.dir) {
    console.error('ERROR: --dir=<backup-directory> is required');
    console.error('Example: node scripts/backup/db-restore.mjs --dir=backups/db/2026-07-09');
    process.exit(1);
  }

  if (!fs.existsSync(args.dir)) {
    console.error(`ERROR: directory not found: ${args.dir}`);
    process.exit(1);
  }

  const meta = JSON.parse(fs.readFileSync(path.join(args.dir, 'meta.json'), 'utf8'));
  const schema = JSON.parse(fs.readFileSync(path.join(args.dir, 'schema.json'), 'utf8'));

  console.log('═══════════════════════════════════════════════════════');
  console.log('  EXAMANET — DATABASE RESTORE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Backup from: ${meta.timestamp}`);
  console.log(`  Database:    ${meta.database}`);
  console.log(`  Mode:        ${args.mode}${args.dryRun ? ' (DRY-RUN)' : ''}`);
  console.log(`  Table:       ${args.table || 'ALL'}`);
  console.log('');

  if (args.mode === 'truncate' && !args.dryRun) {
    console.log('  ⚠️  TRUNCATE MODE WILL DELETE EXISTING DATA ⚠️');
    console.log('  Press Ctrl+C in 5s to abort...');
    await new Promise((r) => setTimeout(r, 5000));
  }

  let totalRestored = 0;
  for (const { name, rows } of schema.tables) {
    if (args.table && name !== args.table) continue;
    if (!rows || rows === 0) continue;

    const filePath = path.join(args.dir, `${name}.json`);
    if (!fs.existsSync(filePath)) continue;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const result = await restoreTable(name, data, args.mode, args.dryRun);
    if (result.ok !== undefined) totalRestored += result.ok;
  }

  console.log('\n═══════════════════════════════════════════════════════');
  if (args.dryRun) {
    console.log(`  ✓ DRY-RUN complete — would restore ${totalRestored} rows`);
  } else {
    console.log(`  ✓ Restored ${totalRestored} rows`);
  }
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('[db-restore] FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

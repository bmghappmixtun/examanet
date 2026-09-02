#!/usr/bin/env node
/**
 * Examanet Database Backup — Prisma-based JSON dump
 *
 * Dumps all critical tables to JSON files. This complements Neon PITR
 * (which only restores the whole DB) by giving us table-level snapshots
 * we can inspect, diff, and selectively restore.
 *
 * Usage: node scripts/backup/db-dump.mjs [--out=./backups/db/YYYY-MM-DD]
 *
 * Output:
 *   - schema.json     : Table list with row counts
 *   - meta.json       : Backup metadata (timestamp, version, etc.)
 *   - <table>.json    : All rows from each table (only non-empty)
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Tables to backup, mapped to Prisma model names
const TABLES = [
  { table: 'user', model: 'User' },
  { table: 'otp_code', model: 'OtpCode' },
  { table: 'session', model: 'Session' },
  { table: 'level', model: 'Level' },
  { table: 'class', model: 'Class' },
  { table: 'section', model: 'Section' },
  { table: 'subject', model: 'Subject' },
  { table: 'resource', model: 'Resource' },
  { table: 'teacher_file', model: 'TeacherFile' },
  { table: 'comment', model: 'Comment' },
  { table: 'rating', model: 'Rating' },
  { table: 'favorite', model: 'Favorite' },
  { table: 'view', model: 'View' },
  { table: 'download', model: 'Download' },
  { table: 'share', model: 'Share' },
  { table: 'report', model: 'Report' },
  { table: 'notification', model: 'Notification' },
  { table: 'newsletter', model: 'Newsletter' },
  { table: 'teacher_invitation', model: 'TeacherInvitation' },
  { table: 'setting', model: 'Setting' },
  { table: 'follow', model: 'Follow' },
  { table: 'conversation', model: 'Conversation' },
  { table: 'message', model: 'Message' },
  { table: 'contact_message', model: 'ContactMessage' },
  { table: 'search_synonym', model: 'SearchSynonym' },
  { table: 'search_log', model: 'SearchLog' },
];

function getOutDir() {
  const arg = process.argv.find((a) => a.startsWith('--out='));
  const base = arg ? arg.slice(6) : './backups/db';
  const date = new Date().toISOString().slice(0, 10);
  return path.join(base, date);
}

async function main() {
  const outDir = getOutDir();
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[db-dump] Output dir: ${outDir}`);
  const start = Date.now();
  const meta = {
    timestamp: new Date().toISOString(),
    tool: 'prisma-json-dump',
    version: '1.0',
    database: process.env.DATABASE_URL?.match(/@([^/]+)/)?.[1] || 'unknown',
  };

  const schema = { tables: [] };
  let totalRows = 0;

  for (const { table, model: modelName } of TABLES) {
    try {
      const model = prisma[modelName];
      if (!model || typeof model.findMany !== 'function') {
        console.log(`  [skip] ${table} (Prisma model ${modelName} not found)`);
        continue;
      }

      // Get all rows in batches of 1000
      const allRows = [];
      let skip = 0;
      const batchSize = 1000;
      while (true) {
        const rows = await model.findMany({ skip, take: batchSize });
        if (rows.length === 0) break;
        allRows.push(...rows);
        if (rows.length < batchSize) break;
        skip += batchSize;
      }

      const count = allRows.length;
      totalRows += count;
      schema.tables.push({ name: table, rows: count });

      if (count > 0) {
        const filePath = path.join(outDir, `${table}.json`);
        fs.writeFileSync(filePath, JSON.stringify(allRows, null, 2));
        const sizeKB = Math.round(fs.statSync(filePath).size / 1024);
        console.log(
          `  [ok]   ${table.padEnd(30)} ${String(count).padStart(8)} rows (${sizeKB} KB)`,
        );
      } else {
        console.log(`  [empty] ${table}`);
      }
    } catch (err) {
      console.error(`  [err]  ${table}: ${err.message}`);
      schema.tables.push({ name: table, error: err.message });
    }
  }

  fs.writeFileSync(path.join(outDir, 'schema.json'), JSON.stringify(schema, null, 2));
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\n[db-dump] DONE in ${duration}s — ${totalRows} rows across ${schema.tables.length} tables`,
  );
  console.log(`[db-dump] Output: ${outDir}`);
}

main()
  .catch((e) => {
    console.error('[db-dump] FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

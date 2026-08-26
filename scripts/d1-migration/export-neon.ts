// @ts-nocheck
/**
 * export-neon.ts
 * Export all Neon Postgres tables to JSON for D1 migration
 *
 * Usage: npx tsx export-neon.ts
 *
 * Outputs to ./exports/{table}.json
 * Transformations applied on the fly:
 *   - Date → ISO string (Drizzle will parse to timestamp)
 *   - String[] → JSON string (Drizzle mode: 'json')
 *   - Json → JSON string (Drizzle mode: 'json')
 *   - BigInt → string (JSON can't represent BigInt)
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://edutunisie_app:npg_uwOy9TgqYS5D@ep-round-art-asyh88wq-pooler.c-4.eu-central-1.aws.neon.tech/neondb';

const EXPORT_DIR = path.join(__dirname, 'exports');

// Tables to export in dependency order
const TABLES = [
  // Reference tables (no dependencies)
  'Level',
  'Class',
  'Section',
  'Subject',

  // User-related
  'User',
  'OtpCode',
  'Session',
  'TeacherVerificationFile',
  'TeacherFile',
  'TeacherInvitation',
  'Follow',

  // Resource-related (User must come first)
  'Resource',
  'ResourceContent',
  'ResourceMetadata',
  'ResourceSummary',
  'Comment',
  'Rating',
  'Favorite',
  'View',
  'Download',
  'Share',
  'Report',
  'Notification',
  'Newsletter',

  // Other
  'Setting',
  'Conversation',
  'Message',
  'ContactMessage',
  'SearchSynonym',
  'SearchLog',
  'ApiProvider',
  'ApiProviderUsage',
  'ErrorLog',
  'VercelLog',
];

// Columns to skip (Postgres-specific, not in D1 schema)
const SKIP_COLUMNS: Record<string, string[]> = {
  // Add columns that exist in Neon but not in D1 here
  // e.g., 'Resource': ['searchVector'] (we use FTS5 instead)
  Resource: ['searchVector'],
};

async function exportTable(client: Client, table: string) {
  const skipCols = SKIP_COLUMNS[table] || [];
  const allCols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [table]);

  const cols = allCols.rows
    .filter((r) => !skipCols.includes(r.column_name))
    .map((r) => `"${r.column_name}"`);

  if (cols.length === 0) {
    console.log(`  ⚠️ ${table}: no columns to export`);
    return 0;
  }

  const colNames = allCols.rows
    .filter((r) => !skipCols.includes(r.column_name))
    .map((r) => r.column_name);

  // Get count first
  const countRes = await client.query(`SELECT COUNT(*)::int as c FROM "${table}"`);
  const total = countRes.rows[0].c;

  if (total === 0) {
    console.log(`  ⏭ ${table}: 0 rows (skip)`);
    return 0;
  }

  // Stream all rows (use cursor for large tables)
  console.log(`  📦 ${table}: exporting ${total} rows...`);

  const BATCH = 1000;
  const rows: any[] = [];

  for (let offset = 0; offset < total; offset += BATCH) {
    const res = await client.query(`
      SELECT ${cols.join(', ')}
      FROM "${table}"
      ORDER BY 1
      LIMIT $1 OFFSET $2
    `, [BATCH, offset]);

    for (const row of res.rows) {
      const transformed: any = {};
      for (const colName of colNames) {
        const colType = allCols.rows.find((r) => r.column_name === colName)?.data_type;
        const val = row[colName];
        transformed[colName] = transformValue(val, colType);
      }
      rows.push(transformed);
    }

    if (offset % 5000 === 0) {
      process.stdout.write(`    ${offset}/${total}\r`);
    }
  }

  process.stdout.write(`    ${total}/${total}\n`);

  // Write to JSON
  fs.writeFileSync(
    path.join(EXPORT_DIR, `${table}.json`),
    JSON.stringify(rows, null, 0), // No pretty-print for size
  );

  console.log(`  ✅ ${table}: ${rows.length} rows → ${table}.json (${(fs.statSync(path.join(EXPORT_DIR, `${table}.json`)).size / 1024 / 1024).toFixed(2)} MB)`);
  return rows.length;
}

function transformValue(val: any, colType: string): any {
  if (val === null || val === undefined) return null;

  // Date types → ISO string
  if (val instanceof Date) {
    return val.toISOString();
  }

  // BigInt → string
  if (typeof val === 'bigint') {
    return val.toString();
  }

  // JSON/JSONB → string (Drizzle will parse on insert)
  if (colType === 'json' || colType === 'jsonb') {
    return JSON.stringify(val);
  }

  // Arrays → JSON string
  if (Array.isArray(val)) {
    return JSON.stringify(val);
  }

  // Numbers, strings, booleans → as-is
  return val;
}

async function main() {
  console.log('🚀 Exporting Neon → JSON for D1 migration');
  console.log(`📁 Output: ${EXPORT_DIR}`);
  console.log(`🔗 Database: ${DATABASE_URL.split('@')[1]?.split('/')[0]}`);
  console.log('');

  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let totalRows = 0;
  const start = Date.now();

  for (const table of TABLES) {
    try {
      const n = await exportTable(client, table);
      totalRows += n;
    } catch (e: any) {
      console.log(`  ❌ ${table}: ${e.message}`);
    }
  }

  await client.end();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('');
  console.log(`✅ Export complete: ${totalRows} rows in ${elapsed}s`);
  console.log(`📁 Files in: ${EXPORT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

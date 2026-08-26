// @ts-nocheck
/**
 * import-d1.ts (v5)
 * Import JSON exports into Cloudflare D1 via HTTP API
 * 
 * Uses D1's HTTP API (POST /query) for bulk imports.
 * Bypasses wrangler's per-statement size limits.
 * 
 * Usage: npx tsx import-d1.ts [table]
 */

import * as fs from 'fs';
import * as path from 'path';

const EXPORT_DIR = path.join(__dirname, 'exports');
const SQL_DIR = path.join(__dirname, 'sql');

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const D1_DATABASE_ID = '22ad2e7f-1692-486e-9131-d6c4062012e1';

if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
  console.error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID');
  process.exit(1);
}

const IMPORT_ORDER = [
  'Level', 'Class', 'Section', 'Subject',
  'User', 'OtpCode', 'Session',
  'Resource', 'ResourceContent', 'ResourceMetadata', 'ResourceSummary',
  'TeacherFile',
  'Notification', 'ContactMessage', 'SearchSynonym',
  'ApiProvider', 'ApiProviderUsage', 'ErrorLog',
];

const BATCH_SIZE = 5; // Smaller batches to avoid SQLITE_TOOBIG

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

async function execD1(sql: string): Promise<any> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
  const body = JSON.stringify({ sql });
  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body,
  });
  const elapsed = Date.now() - start;
  const data = await res.json();
  if (!res.ok || !data.success) {
    const err = data.errors?.[0]?.message || JSON.stringify(data).slice(0, 200);
    throw new Error(`D1 error: ${err}`);
  }
  return data;
}

async function getD1Schema(table: string): Promise<ColumnInfo[]> {
  const data = await execD1(`PRAGMA table_info("${table}");`);
  if (!data.result?.[0]?.results) return [];
  return data.result[0].results as ColumnInfo[];
}

function sqlValue(val: any, col: ColumnInfo): string {
  if (val === null || val === undefined || val === '') {
    if (col.notnull) {
      if (col.dflt_value) return col.dflt_value;
      if (col.name.endsWith('At') || col.name === 'expires') {
        return String(Math.floor(Date.now() / 1000));
      }
      if (col.type === 'INTEGER') return '0';
      if (col.type === 'REAL') return '0';
      if (col.type === 'TEXT') return "''";
      return "''";
    }
    return 'NULL';
  }

  if (col.type === 'INTEGER' || col.type === 'REAL') {
    const num = Number(val);
    return isNaN(num) ? '0' : String(num);
  }

  if (col.name.endsWith('At') || col.name === 'expires') {
    let ts: number;
    if (typeof val === 'number') {
      ts = val > 1e12 ? Math.floor(val / 1000) : val;
    } else {
      ts = Math.floor(new Date(val).getTime() / 1000);
    }
    return isNaN(ts) ? 'NULL' : String(ts);
  }

  let str: string;
  if (typeof val === 'object') {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }
  return `'${str.replace(/'/g, "''")}'`;
}

async function importTable(table: string): Promise<number> {
  const filePath = path.join(EXPORT_DIR, `${table}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⏭ ${table}: no export file`);
    return 0;
  }

  const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (rows.length === 0) {
    console.log(`  ⏭ ${table}: 0 rows`);
    return 0;
  }

  let cols: ColumnInfo[];
  try {
    cols = await getD1Schema(table);
  } catch (e: any) {
    console.log(`  ❌ ${table}: cannot get schema: ${e.message?.slice(0, 100)}`);
    return 0;
  }
  if (cols.length === 0) {
    console.log(`  ⚠️ ${table}: no columns in D1 schema`);
    return 0;
  }

  const colNames = cols.map((c) => c.name);
  console.log(`  📦 ${table}: importing ${rows.length} rows (${cols.length} cols, batch=${BATCH_SIZE})...`);

  let imported = 0;
  const start = Date.now();
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valuesList = batch
      .map((row) => `(${cols.map((c) => sqlValue(row[c.name], c)).join(', ')})`)
      .join(', ');

    const sql = `INSERT OR REPLACE INTO "${table}" (${colNames.map((n) => `"${n}"`).join(', ')}) VALUES ${valuesList};`;

    try {
      await execD1(sql);
      imported += batch.length;
      if (i % 200 === 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const rate = (imported / elapsed).toFixed(0);
        process.stdout.write(`    ${imported}/${rows.length} (${rate} rows/s)\r`);
      }
    } catch (e: any) {
      console.log(`\n  ❌ ${table} at row ${i}: ${e.message?.slice(0, 200)}`);
      return imported;
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  process.stdout.write(`\n  ✅ ${table}: ${imported} rows in ${elapsed}s\n`);
  return imported;
}

async function main() {
  const target = process.argv[2];
  console.log('🚀 Importing JSON → D1 (v5, HTTP API)');
  console.log(`📁 Source: ${EXPORT_DIR}`);
  console.log(`🎯 DB: examanet-db (${D1_DATABASE_ID})`);
  console.log('');

  const start = Date.now();
  let totalRows = 0;

  if (target) {
    totalRows = await importTable(target);
  } else {
    for (const table of IMPORT_ORDER) {
      totalRows += await importTable(table);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('');
  console.log(`✅ Import complete: ${totalRows} rows in ${elapsed}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

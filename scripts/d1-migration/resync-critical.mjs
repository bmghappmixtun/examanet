#!/usr/bin/env node
/**
 * resync-critical.mjs (v3)
 * 2026-09-03: Targeted re-sync with column mapping
 *
 * Tables: View, Download, ResourceContent, ResourceMetadata, ResourceSummary
 * Strategy: INSERT OR IGNORE row by row (D1 SQLite aborts on FK violation)
 * Safety: per-row error handling, file log, FK pre-filtering, column mapping
 *
 * IMPORTANT: Neon (Postgres) column names differ from D1 (SQLite).
 * Use the COLUMNS_MAP below to map Neon → D1.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.join(__dirname, 'exports');
const LOG_FILE = path.join(__dirname, `resync-${new Date().toISOString().slice(0,10)}.log`);

const DATABASE_URL = process.env.DATABASE_URL;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const D1_DATABASE_ID = '***REMOVED***';

if (!DATABASE_URL || !CF_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error('Missing DATABASE_URL, CLOUDFLARE_API_TOKEN, or CLOUDFLARE_ACCOUNT_ID');
  process.exit(1);
}

const ALL_TABLES = ['View', 'Download', 'ResourceContent', 'ResourceMetadata', 'ResourceSummary', 'TeacherInvitation'];
const TABLES = process.argv.length > 2 ? process.argv.slice(2) : ALL_TABLES;

const REQUEST_TIMEOUT = 60000;

// Column mappings: D1 column → Neon column (or special handler)
// If Neon column doesn't exist, leave undefined (D1 will use NULL or default)
const COLUMNS_MAP = {
  'View': {
    'id': 'id',
    'resourceId': 'resourceId',
    'userId': 'userId',
    'ipAddress': 'ipAddress',
    'userAgent': 'userAgent',
    'createdAt': 'createdAt',
    // Note: Neon 'duration' has no D1 equivalent, skipped
  },
  'Download': {
    'id': 'id',
    'resourceId': 'resourceId',
    'userId': 'userId',
    'ipAddress': 'ipAddress',
    'userAgent': 'userAgent',  // Neon has this
    'createdAt': 'createdAt',
    // Note: D1 has 'original' (boolean) not in Neon, defaults to 0
  },
  'ResourceContent': {
    'resourceId': 'resourceId',
    'text': 'fullText',  // Neon 'fullText' → D1 'text'
    'pages': 'pageCount',  // Neon 'pageCount' → D1 'pages'
    'wordCount': 'wordCount',
    'charCount': null,  // D1 only, no Neon source
    'updatedAt': 'extractedAt',  // Neon 'extractedAt' → D1 'updatedAt'
    // Note: Neon 'extractionMethod', 'extractionDurationMs', 'extractionError' have no D1 equivalent
  },
  'ResourceMetadata': {
    'resourceId': 'resourceId',
    'systemName': 'systemName',
    'subject': 'subject',
    'profNames': 'profNames',  // Neon array → D1 TEXT (JSON)
    'dossierTechnique': 'dossierTechnique',
    'shortKeyPoints': 'shortKeyPoints',  // Neon array → D1 TEXT (JSON)
    'keyPoints': 'keyPoints',  // Neon array → D1 TEXT (JSON)
    'topics': 'topics',  // Neon array → D1 TEXT (JSON)
    'level': 'level',
    'estimatedTimeMinutes': 'estimatedTimeMinutes',
    'prerequisites': 'prerequisites',  // Neon array → D1 TEXT (JSON)
    'keyInsights': 'keyInsights',  // Neon array → D1 TEXT (JSON)
    'exerciseInsights': 'exerciseInsights',  // Neon array → D1 TEXT (JSON)
    'updatedAt': 'extractedAt',  // Neon 'extractedAt' → D1 'updatedAt'
    // Note: Neon 'year', 'type', 'subtype', 'difficulty', 'schoolName', 'generalSubject', 'courseSubject' have no D1 equivalent
  },
  'ResourceSummary': {
    'resourceId': 'resourceId',
    'summary': 'summary',
    'language': 'language',
    'model': 'modelUsed',
    'generatedAt': 'extractedAt',
    'updatedAt': 'updatedAt',
  },
  'TeacherInvitation': {
    'id': 'id',
    'email': 'email',
    'token': 'token',
    'invitedById': 'invitedById',
    'status': 'status',
    'message': 'customMessage',  // Neon 'customMessage' → D1 'message' (different naming)
    'expiresAt': 'expiresAt',
    'acceptedAt': 'activatedAt',  // Neon 'activatedAt' → D1 'acceptedAt'
    'invitationSentAt': 'emailSentAt',  // Neon 'emailSentAt' → D1 'invitationSentAt'
    'invitationActivatedAt': 'activatedAt',  // Neon 'activatedAt' → D1 'invitationActivatedAt'
    'createdAt': 'createdAt',
    'clickCount': 'clickCount',
    'customMessage': 'customMessage',  // both have this
    'tempPassword': 'tempPassword',
    'resendMessageId': 'resendMessageId',
    'deliveryStatus': 'deliveryStatus',
    'deliverySyncedAt': 'deliverySyncedAt',
    'activateIpAddress': 'activateIpAddress',
    'activateUserAgent': 'activateUserAgent',
  },
};

const FK_RELATIONSHIPS = {
  'View': { 'resourceId': { table: 'Resource', column: 'id' } },
  'Download': { 'resourceId': { table: 'Resource', column: 'id' } },
  'ResourceContent': { 'resourceId': { table: 'Resource', column: 'id' } },
  'ResourceMetadata': { 'resourceId': { table: 'Resource', column: 'id' } },
  'ResourceSummary': { 'resourceId': { table: 'Resource', column: 'id' } },
  'TeacherInvitation': { 'invitedById': { table: 'User', column: 'id' } },
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  process.stdout.write(line);
}

async function execD1(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const err = data.errors?.[0]?.message || JSON.stringify(data).slice(0, 300);
    throw new Error(`D1 error: ${err}`);
  }
  return data;
}

async function getD1Schema(table) {
  const data = await execD1(`PRAGMA table_info("${table}");`);
  return data.result?.[0]?.results || [];
}

async function getD1Ids(table, column) {
  const data = await execD1(`SELECT "${column}" as id FROM "${table}"`);
  const rows = data.result?.[0]?.results || [];
  return new Set(rows.map(r => r.id));
}

async function reexportTable(client, table) {
  log(`📤 Re-exporting ${table} from Neon...`);
  const res = await client.query(`SELECT * FROM "${table}"`);
  const rows = res.rows;
  const filePath = path.join(EXPORT_DIR, `${table}.json`);
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 0));
  log(`  💾 Saved ${rows.length.toLocaleString()} rows`);
  return rows;
}

// Convert Neon value to D1 value based on column name
function transformValue(d1Col, neonVal) {
  if (neonVal === null || neonVal === undefined) return null;
  
  // Date/timestamp columns: Neon returns Date object (from pg) or ISO string
  if (d1Col.endsWith('At') || d1Col === 'expires' || d1Col === 'updatedAt') {
    if (neonVal instanceof Date) {
      return Math.floor(neonVal.getTime() / 1000);
    }
    if (typeof neonVal === 'string') {
      const d = new Date(neonVal);
      if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
    }
    if (typeof neonVal === 'number') {
      return neonVal > 1e12 ? Math.floor(neonVal / 1000) : neonVal;
    }
  }
  
  // Array → JSON string (D1 stores arrays as TEXT/JSON)
  if (Array.isArray(neonVal)) {
    return JSON.stringify(neonVal);
  }
  
  return neonVal;
}

function escapeSql(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return isNaN(v) ? '0' : String(Math.floor(v));
  if (v instanceof Date) return String(Math.floor(v.getTime() / 1000));
  if (typeof v === 'object') {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildRowInsertSQL(table, d1Cols, d1ColTypes, mapping, neonRow) {
  const colNames = [];
  const values = [];
  for (const d1Col of d1Cols) {
    const neonCol = mapping[d1Col];
    let neonVal = neonCol ? neonRow[neonCol] : undefined;
    let transformed = transformValue(d1Col, neonVal);
    const colInfo = d1ColTypes.find(c => c.name === d1Col);
    const notnull = colInfo && colInfo.notnull === 1;
    
    // Handle NULL values:
    if (transformed === null) {
      if (notnull) {
        // For NOT NULL columns, provide a sensible default
        if (d1Col === 'language') {
          transformed = 'fr';
        } else if (d1Col === 'updatedAt' || d1Col === 'createdAt' || d1Col.endsWith('At')) {
          transformed = Math.floor(Date.now() / 1000);
        } else if (d1Col === 'id') {
          // Generate a cuid-like ID
          transformed = 'rs_' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
        } else {
          transformed = '';  // Empty string for other NOT NULL text
        }
      } else if (d1Col !== 'resourceId') {
        // Skip NULL for nullable non-PK columns
        continue;
      }
    }
    
    colNames.push(`"${d1Col}"`);
    values.push(escapeSql(transformed));
  }
  if (colNames.length === 0) return null;
  return `INSERT OR IGNORE INTO "${table}" (${colNames.join(', ')}) VALUES (${values.join(', ')});`;
}

async function importTable(client, table) {
  log(`\n🔄 ${table}: re-export + INSERT OR IGNORE...`);
  
  const rows = await reexportTable(client, table);
  if (rows.length === 0) {
    log(`  ⏭ ${table}: 0 rows in Neon`);
    return { table, exported: 0, inserted: 0, errors: 0 };
  }
  
  const d1ColTypes = await getD1Schema(table);
  const d1Cols = d1ColTypes.map(c => c.name);
  if (d1Cols.length === 0) {
    log(`  ❌ ${table}: no columns in D1 schema`);
    return { table, exported: rows.length, inserted: 0, errors: 0 };
  }
  
  const mapping = COLUMNS_MAP[table] || {};
  log(`  📋 D1 columns: ${d1Cols.join(', ')}`);
  log(`  🗺️  Mapping: ${Object.entries(mapping).map(([d, n]) => `${d}←${n}`).join(', ')}`);
  
  // Pre-fetch FK target IDs
  const fks = FK_RELATIONSHIPS[table] || {};
  const fkMaps = {};
  for (const [col, ref] of Object.entries(fks)) {
    log(`  🔗 Fetching FK target ${ref.table}.${ref.column}...`);
    fkMaps[col] = await getD1Ids(ref.table, ref.column);
    log(`    ${fkMaps[col].size.toLocaleString()} ids in D1 ${ref.table}`);
  }
  
  // Filter rows by FK existence
  let filtered = rows;
  let skippedFk = 0;
  for (const [col, validIds] of Object.entries(fkMaps)) {
    const before = filtered.length;
    filtered = filtered.filter(r => r[col] && validIds.has(r[col]));
    skippedFk += before - filtered.length;
  }
  if (skippedFk > 0) {
    log(`  ⚠️ Filtered out ${skippedFk} rows with missing FK target`);
  }
  log(`  📊 After FK filter: ${filtered.length.toLocaleString()} rows`);
  
  if (filtered.length === 0) {
    return { table, exported: rows.length, inserted: 0, errors: 0, skipped: skippedFk };
  }
  
  // Row by row INSERT OR IGNORE with concurrency
  const CONCURRENCY = 5;  // 5 parallel API calls
  const start = Date.now();
  let attempted = 0;
  let actualInserted = 0;
  let errors = 0;
  
  for (let i = 0; i < filtered.length; i += CONCURRENCY) {
    const batch = filtered.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (row) => {
      try {
        const sql = buildRowInsertSQL(table, d1Cols, d1ColTypes, mapping, row);
        if (!sql) return 0;
        const data = await execD1(sql);
        return data.result?.[0]?.meta?.changes || 0;
      } catch (e) {
        errors++;
        if (errors <= 3) {
          log(`  ❌ ${table}: ${e.message.slice(0, 200)}`);
        }
        return 0;
      }
    });
    const results = await Promise.all(promises);
    actualInserted += results.reduce((a, b) => a + b, 0);
    attempted += batch.length;
    
    if (i % 100 === 0 || i + CONCURRENCY >= filtered.length) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const rate = (attempted / elapsed).toFixed(0);
      log(`  📊 ${table}: ${attempted.toLocaleString()}/${filtered.length.toLocaleString()} (${actualInserted.toLocaleString()} inserted, ${rate} rows/s)`);
    }
  }
  
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`  ✅ ${table}: ${attempted.toLocaleString()} attempted, ${actualInserted.toLocaleString()} actually inserted in ${elapsed}s (${errors} row errors, ${skippedFk} FK-skipped)`);
  return { table, exported: rows.length, attempted, inserted: actualInserted, skipped: skippedFk, errors };
}

async function main() {
  log(`\n🚀 Re-sync v3 started (tables: ${TABLES.join(', ')})`);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  const results = [];
  for (const table of TABLES) {
    try {
      const r = await importTable(client, table);
      results.push(r);
    } catch (e) {
      log(`❌ ${table} FAILED: ${e.message}`);
      results.push({ table, exported: 0, attempted: 0, inserted: 0, errors: 1, fatal: e.message });
    }
  }
  
  await client.end();
  
  log(`\n📊 FINAL SUMMARY`);
  log('─'.repeat(80));
  log(`  ${'Table'.padEnd(25)} ${'exported'.padStart(10)} ${'attempted'.padStart(10)} ${'inserted'.padStart(10)} ${'skipped'.padStart(10)} ${'errors'.padStart(8)}`);
  for (const r of results) {
    log(`  ${(r.table||'').padEnd(25)} ${String(r.exported||0).padStart(10)} ${String(r.attempted||0).padStart(10)} ${String(r.inserted||0).padStart(10)} ${String(r.skipped||0).padStart(10)} ${String(r.errors||0).padStart(8)}`);
  }
  log(`\n📄 Full log: ${LOG_FILE}`);
}

main().catch(e => {
  log(`\n💥 FATAL: ${e.message}`);
  process.exit(1);
});

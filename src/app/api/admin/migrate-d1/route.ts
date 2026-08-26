// @ts-nocheck
/**
 * /api/admin/migrate-d1
 * CF Worker endpoint that runs inside CF's network
 * to migrate data from Neon Postgres to Cloudflare D1.
 *
 * Why this exists:
 *   - Sandbox network is flaky (DNS cache overflow 503s)
 *   - CF Worker → D1 = same datacenter, no network issues
 *   - Worker → Hyperdrive → Neon = direct, no sandbox interference
 *
 * Usage:
 *   POST /api/admin/migrate-d1
 *   Headers:
 *     x-migration-token: ${MIGRATION_TOKEN}
 *     Content-Type: application/json
 *   Body:
 *     {
 *       table: "ResourceContent",
 *       offset: 0,
 *       limit: 500
 *     }
 *
 * Returns:
 *   {
 *     imported: 500,
 *     total: 15347,
 *     hasMore: true,
 *     nextOffset: 500,
 *     durationMs: 2300
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
// Custom neon HTTP client (no TCP, works across regions in CF Workers)
async function neonQuery(connectionString: string, sql: string, params: any[] = []): Promise<any[]> {
  // Convert postgresql://user:pass@host/db → https://host/sql
  const match = connectionString.match(/postgresql:\/\/([^:]+):([^@]+)@([^/]+)\/(.+)/);
  if (!match) throw new Error('Invalid connection string format');
  const [, user, password, host, database] = match;
  
  const url = `https://${host}/sql`;
  // Neon's HTTP SQL endpoint: pass auth via Neon-Connection-String header
  // (not Basic auth - that's for the websocket proxy)
  // Reference: https://api-docs.neon.tech/reference/neonsqlquerysqlpost
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': connectionString,
      'User-Agent': 'examanet-migration/1.0',
    },
    body: JSON.stringify({ query: sql, params: params || [] }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Neon HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  
  const data = await response.json();
  // Neon returns { rows: [...], fields: [...] }
  return data.rows || [];
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tables that can be migrated. Order matches IMPORT_ORDER in scripts/d1-migration/import-d1.ts
const ALLOWED_TABLES = [
  'Level', 'Class', 'Section', 'Subject',
  'User', 'OtpCode', 'Session',
  'Resource', 'ResourceContent', 'ResourceMetadata', 'ResourceSummary',
  'TeacherFile',
  'Notification', 'ContactMessage', 'SearchSynonym',
  'ApiProvider', 'ApiProviderUsage', 'ErrorLog',
];

// Skip columns from Neon (don't exist in D1 schema)
const SKIP_COLUMNS: Record<string, string[]> = {
  Resource: ['searchVector', 'search_vector'],
  User: [],
};

const BATCH_SIZE = 5; // rows per INSERT (D1 SQLITE_TOOBIG workaround)

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

async function execD1(d1: D1Database, sql: string): Promise<any> {
  const stmt = d1.prepare(sql);
  const result = await stmt.all();
  return result;
}

async function getD1Schema(d1: D1Database, table: string): Promise<ColumnInfo[]> {
  const stmt = d1.prepare(`PRAGMA table_info("${table}");`);
  const result = await stmt.all();
  return (result.results || []) as ColumnInfo[];
}

function transformValue(val: any, colName: string, colType: string): any {
  if (val === null || val === undefined || val === '') {
    return null;
  }
  // Date → epoch seconds
  if (val instanceof Date) {
    return Math.floor(val.getTime() / 1000);
  }
  // BigInt → string
  if (typeof val === 'bigint') {
    return val.toString();
  }
  // JSON/JSONB → string (Drizzle will parse)
  if (colType === 'json' || colType === 'jsonb') {
    return JSON.stringify(val);
  }
  // Arrays → JSON string
  if (Array.isArray(val)) {
    return JSON.stringify(val);
  }
  return val;
}

function isTimestampColumn(name: string): boolean {
  return name.endsWith('At') || name === 'expires';
}

function sqlValue(val: any, col: ColumnInfo): string {
  // Transform the value first
  const transformed = transformValue(val, col.name, col.type);
  // If null and NOT NULL → use safe default
  if (transformed === null || transformed === undefined || transformed === '') {
    if (col.notnull) {
      if (col.dflt_value) return col.dflt_value;
      if (isTimestampColumn(col.name)) {
        return String(Math.floor(Date.now() / 1000));
      }
      if (col.type === 'INTEGER') return '0';
      if (col.type === 'REAL') return '0';
      if (col.type === 'TEXT') return "''";
      return "''";
    }
    return 'NULL';
  }

  // Type-specific handling
  if (col.type === 'INTEGER' || col.type === 'REAL') {
    const num = Number(transformed);
    return isNaN(num) ? '0' : String(num);
  }

  if (isTimestampColumn(col.name)) {
    let ts: number;
    if (typeof transformed === 'number') {
      ts = transformed > 1e12 ? Math.floor(transformed / 1000) : transformed;
    } else {
      ts = Math.floor(new Date(transformed).getTime() / 1000);
    }
    return isNaN(ts) ? 'NULL' : String(ts);
  }

  // Default text
  let str: string;
  if (typeof transformed === 'object') {
    str = JSON.stringify(transformed);
  } else {
    str = String(transformed);
  }
  return `'${str.replace(/'/g, "''")}'`;
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  // Auth check
  const token = req.headers.get('x-migration-token');
  const expected = process.env.MIGRATION_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { table, offset = 0, limit = 500 } = body;

  if (!table || !ALLOWED_TABLES.includes(table)) {
    return NextResponse.json(
      { error: `Table must be one of: ${ALLOWED_TABLES.join(', ')}` },
      { status: 400 },
    );
  }

  // Get CF context (D1 binding)
  let d1: D1Database;
  try {
    const ctx = await getCloudflareContext({ async: true });
    d1 = (ctx as any).env.DB;
  } catch (e: any) {
    return NextResponse.json({ error: `D1 binding not available: ${e.message}` }, { status: 500 });
  }

  if (!d1) {
    return NextResponse.json({ error: 'D1 binding DB is null' }, { status: 500 });
  }

  // Get D1 schema
  let cols: ColumnInfo[];
  try {
    cols = await getD1Schema(d1, table);
  } catch (e: any) {
    return NextResponse.json({ error: `Cannot get D1 schema: ${e.message}` }, { status: 500 });
  }

  if (cols.length === 0) {
    return NextResponse.json({ error: `Table ${table} not in D1` }, { status: 404 });
  }

  // Use NEON_DATABASE_URL directly (Hyperdrive connectionString has region issues)
  const NEON_URL = process.env.NEON_DATABASE_URL;
  if (!NEON_URL) {
    return NextResponse.json({ error: 'NEON_DATABASE_URL env var not set' }, { status: 500 });
  }
  console.log('[migrate-d1] Host:', new URL(NEON_URL.replace('postgresql://', 'http://')).host);

  // Use Neon serverless driver (HTTP transport - works across regions)
  const sql = (q: string, params: any[] = []) => neonQuery(NEON_URL, q, params);

  let total = 0;
  let rows: any[] = [];

  try {
    // Get total count
    const countRes = await sql(`SELECT COUNT(*)::int as c FROM "${table}"`);
    total = Number(countRes[0]?.c || 0);

    if (total === 0) {
          return NextResponse.json({
        imported: 0,
        total: 0,
        hasMore: false,
        nextOffset: offset,
        durationMs: Date.now() - start,
      });
    }

    // Build SELECT excluding skipped columns
    const skipCols = SKIP_COLUMNS[table] || [];
    const d1ColNames = cols.map((c) => c.name);
    // We use SELECT * and filter in code (cheaper than introspecting Neon columns)
    const neonRows = await sql(
      `SELECT * FROM "${table}" ORDER BY 1 LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    rows = neonRows;
  } catch (e: any) {
      return NextResponse.json(
      { error: `Neon query failed: ${e.message?.slice(0, 300)}` },
      { status: 500 },
    );
  }

  if (rows.length === 0) {
      return NextResponse.json({
      imported: 0,
      total,
      hasMore: false,
      nextOffset: offset,
      durationMs: Date.now() - start,
    });
  }

  // Insert into D1 in batches
  const colNames = cols.map((c) => c.name);
  let imported = 0;
  let lastError: string | null = null;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valuesList = batch
      .map((row) => {
        // Filter row to only include D1 columns
        const filtered: any = {};
        for (const col of colNames) {
          filtered[col] = row[col];
        }
        return `(${cols.map((c) => sqlValue(filtered[c.name], c)).join(', ')})`;
      })
      .join(', ');

    const sqlStmt = `INSERT OR REPLACE INTO "${table}" (${colNames.map((n) => `"${n}"`).join(', ')}) VALUES ${valuesList};`;

    try {
      await execD1(d1, sqlStmt);
      imported += batch.length;
    } catch (e: any) {
      lastError = e.message?.slice(0, 200) || 'unknown error';
      console.error(`[migrate-d1] ${table} batch at ${i}: ${lastError}`);
      // Continue with next batch
    }
  }


  const hasMore = offset + imported < total;

  return NextResponse.json({
    imported,
    total,
    hasMore,
    nextOffset: offset + imported,
    lastError,
    durationMs: Date.now() - start,
  });
}

export async function GET(req: NextRequest) {
  // Status check
  const table = req.nextUrl.searchParams.get('table');

  if (!table) {
    return NextResponse.json({
      status: 'ok',
      allowedTables: ALLOWED_TABLES,
      usage: 'POST with { table, offset, limit } and x-migration-token header',
    });
  }

  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: `Table not allowed: ${table}` }, { status: 400 });
  }

  return NextResponse.json({
    status: 'ok',
    table,
    nextAction: `POST with { table: "${table}", offset: 0, limit: 500 }`,
  });
}

import pg from 'pg';

const NEON_URL = 'postgresql://neondb_owner:npg_qLuXzef3bah4@ep-round-art-asyh88wq-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const client = new pg.Client({ connectionString: NEON_URL });
await client.connect();

console.log('=== Neon DB total size ===');
const sizeRes = await client.query(`
  SELECT 
    pg_size_pretty(pg_database_size(current_database())) as total_size,
    pg_database_size(current_database()) as total_bytes
`);
console.log('  Total:', sizeRes.rows[0].total_size, '(' + sizeRes.rows[0].total_bytes + ' bytes)');

console.log('\n=== All tables (top 50 by size) ===');
const tablesRes = await client.query(`
  SELECT 
    c.relname AS table_name,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
    pg_total_relation_size(c.oid) AS bytes,
    c.reltuples::bigint AS row_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public'
  ORDER BY pg_total_relation_size(c.oid) DESC NULLS LAST
  LIMIT 50
`);

let totalBytes = 0;
for (const row of tablesRes.rows) {
  console.log(`  ${row.table_name.padEnd(45)}  ${row.total_size.padStart(10)}  (${String(Math.floor(row.row_count)).padStart(8)} rows)`);
  totalBytes += Number(row.bytes) || 0;
}
console.log(`  ${'TOTAL'.padEnd(45)}  ${pgBytesToPretty(totalBytes).padStart(10)}`);

function pgBytesToPretty(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

await client.end();

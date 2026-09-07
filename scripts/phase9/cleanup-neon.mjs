import pg from 'pg';

const NEON_URL = 'postgresql://neondb_owner:npg_qLuXzef3bah4@ep-round-art-asyh88wq-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const client = new pg.Client({ connectionString: NEON_URL });
await client.connect();

console.log('=== Current user ===');
const userRes = await client.query(`SELECT current_user, current_database()`);
console.log(`  User: ${userRes.rows[0].current_user}, DB: ${userRes.rows[0].current_database}`);

console.log('\n=== BEFORE cleanup ===');
let beforeRes = await client.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
console.log('  Total:', beforeRes.rows[0].size);

const TABLES_TO_DELETE = [
  { name: 'VercelLog', note: 'Logs from Vercel platform, in D1 as CloudflareLog' },
  { name: 'ErrorLog', note: 'Error logs, in D1' },
  { name: 'Session', note: 'User sessions (all invalidated)' },
  { name: 'OtpCode', note: 'One-time passwords (all expired)' },
  { name: 'SearchLog', note: 'Search analytics (in D1)' },
  { name: 'Download', note: 'Download tracking (in D1)' },
  { name: 'Notification', note: 'User notifications (transient)' },
];

for (const t of TABLES_TO_DELETE) {
  const existsRes = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = $1
    ) as exists
  `, [t.name]);
  
  if (!existsRes.rows[0].exists) {
    console.log(`  [SKIP] ${t.name.padEnd(20)} - table does not exist`);
    continue;
  }
  
  // Get row count
  const countRes = await client.query(`SELECT count(*)::int as cnt FROM "${t.name}"`);
  const count = countRes.rows[0].cnt;
  
  // Use DELETE (respects row-level perms)
  try {
    await client.query(`DELETE FROM "${t.name}"`);
    console.log(`  [✓] ${t.name.padEnd(20)} cleared (${count} rows) - ${t.note}`);
  } catch (e) {
    console.log(`  [✗] ${t.name.padEnd(20)} - ${e.message.split('\n')[0]}`);
  }
}

console.log('\n=== After DELETE (before VACUUM) ===');
let midRes = await client.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
console.log('  Total:', midRes.rows[0].size);

console.log('\n=== Vacuuming to reclaim space ===');
try {
  await client.query('VACUUM FULL');
  console.log('  [✓] VACUUM FULL complete');
} catch (e) {
  console.log(`  [✗] VACUUM FULL: ${e.message.split('\n')[0]}`);
}

console.log('\n=== AFTER cleanup ===');
let afterRes = await client.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
console.log('  Total:', afterRes.rows[0].size);

await client.end();

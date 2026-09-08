import pg from 'pg';

const NEON_URL = 'postgresql://neondb_owner:npg_qLuXzef3bah4@ep-round-art-asyh88wq-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const client = new pg.Client({ connectionString: NEON_URL });
await client.connect();

console.log('=== Users by creation date (last 60 days) ===');
const rangeRes = await client.query(`
  SELECT 
    date_trunc('day', "createdAt")::date as day,
    role,
    COUNT(*) as count
  FROM "User"
  WHERE "createdAt" > NOW() - INTERVAL '60 days'
  GROUP BY day, role
  ORDER BY day DESC
  LIMIT 90
`);
if (rangeRes.rowCount === 0) {
  console.log('  No users created in the last 60 days');
}
for (const row of rangeRes.rows) {
  console.log(`  ${row.day.toISOString().split('T')[0]}  ${row.role.padEnd(15)}  ${row.count}`);
}

console.log('\n=== Sample users created recently ===');
const recentRes = await client.query(`
  SELECT id, email, "firstName", "lastName", role, "numericId", "createdAt"
  FROM "User"
  WHERE "createdAt" > NOW() - INTERVAL '60 days'
  ORDER BY "createdAt" DESC
  LIMIT 20
`);
console.log(`  Total: ${recentRes.rowCount} users created in last 60 days`);
for (const row of recentRes.rows) {
  const created = row.createdAt ? row.createdAt.toISOString() : 'N/A';
  console.log(`  ${row.id.slice(0, 8)}  ${(row.email || '').padEnd(35)} ${(row.firstName || '').padEnd(12)} ${(row.lastName || '').padEnd(12)} ${row.role.padEnd(12)} numId=${row.numericId}  ${created}`);
}

console.log('\n=== All users by role (last 60 days) ===');
const roleRes = await client.query(`
  SELECT role, COUNT(*) as count
  FROM "User"
  WHERE "createdAt" > NOW() - INTERVAL '60 days'
  GROUP BY role
  ORDER BY count DESC
`);
for (const row of roleRes.rows) {
  console.log(`  ${row.role.padEnd(15)} ${row.count}`);
}

console.log('\n=== All user creation days (last 20 days) ===');
const allRes = await client.query(`
  SELECT 
    date_trunc('day', "createdAt")::date as day,
    COUNT(*) as count
  FROM "User"
  WHERE "createdAt" > NOW() - INTERVAL '20 days'
  GROUP BY day
  ORDER BY day DESC
`);
for (const row of allRes.rows) {
  console.log(`  ${row.day.toISOString().split('T')[0]}  ${row.count} users`);
}

await client.end();

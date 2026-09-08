// Backfill admin notifications for student registrations since 2026-08-30
// (when we started missing notifications due to the gap)

import pg from 'pg';

const NEON_URL = 'postgresql://neondb_owner:npg_qLuXzef3bah4@ep-round-art-asyh88wq-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const D1_ID = '22ad2e7f-1692-486e-9131-d6c4062012e1';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const pgClient = new pg.Client({ connectionString: NEON_URL });
await pgClient.connect();

console.log('=== Backfilling admin notifications for recent students ===\n');

// Get all STUDENT users created in the last 30 days, in D1, with their numericId
// We need to find them in D1 to backfill
const studentsRes = await pgClient.query(`
  SELECT id, email, "firstName", "lastName", "numericId", "schoolName", "classLevel", "createdAt"
  FROM "User"
  WHERE "createdAt" > NOW() - INTERVAL '30 days'
    AND role = 'STUDENT'
  ORDER BY "createdAt" DESC
`);
console.log(`Found ${studentsRes.rowCount} students in Neon\n`);

for (const student of studentsRes.rows) {
  console.log(`- ${student.firstName} ${student.lastName} (${student.email})  numId=${student.numericId}  created=${student.createdAt.toISOString()}`);
}

await pgClient.end();

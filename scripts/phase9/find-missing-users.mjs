import { execSync } from 'child_process';
import pg from 'pg';

const NEON_URL = 'postgresql://neondb_owner:npg_qLuXzef3bah4@ep-round-art-asyh88wq-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pgClient = new pg.Client({ connectionString: NEON_URL });
await pgClient.connect();

const neonRes = await pgClient.query(`
  SELECT id, email, "firstName", "lastName", role, "numericId", "createdAt"
  FROM "User"
  WHERE "numericId" IS NOT NULL
  ORDER BY "createdAt" DESC
`);
console.log(`Total Neon users with numericId: ${neonRes.rowCount}`);

// Get D1 users via a temporary JSON file to avoid buffer issues
const result = execSync(
  `npx wrangler d1 execute examanet-db --config wrangler.prod.jsonc --remote --command "SELECT numericId, email, firstName, lastName FROM User WHERE numericId IS NOT NULL" --json 2>/dev/null > /tmp/d1-users.json`,
  { encoding: 'utf-8', shell: '/bin/bash', cwd: '/workspace/edutunisie/.worktrees/cloudflare-poc' }
);

// Read the JSON file
const fs = await import('fs');
const d1Content = fs.readFileSync('/tmp/d1-users.json', 'utf-8');
const d1Data = JSON.parse(d1Content);
const d1Rows = d1Data[0]?.results || [];
console.log(`Total D1 users with numericId: ${d1Rows.length}`);

const d1Set = new Set(d1Rows.map(r => r.numericId));
const missing = neonRes.rows.filter(r => !d1Set.has(r.numericId));
console.log(`\n=== ${missing.length} users in Neon but MISSING in D1 ===\n`);

for (const u of missing) {
  console.log(`  numId=${String(u.numericId).padEnd(5)} ${(u.email || '').padEnd(40)} ${(u.firstName || '').padEnd(15)} ${(u.lastName || '').padEnd(15)} ${u.role.padEnd(12)} created=${u.createdAt.toISOString().split('T')[0]}`);
}

// Also check reverse
const neonSet = new Set(neonRes.rows.map(r => r.numericId));
const inD1Only = d1Rows.filter(r => !neonSet.has(r.numericId));
console.log(`\n=== ${inD1Only.length} users in D1 but NOT in Neon ===`);
if (inD1Only.length > 0 && inD1Only.length < 30) {
  for (const u of inD1Only) {
    console.log(`  numId=${String(u.numericId).padEnd(5)} ${(u.email || '').padEnd(40)}`);
  }
}

await pgClient.end();

// Sync orphan users from Neon to D1
// These 6 users registered during the Vercel→CF transition
// Their data is in Neon but not in D1, so they can't log in
import { execSync } from 'child_process';
import pg from 'pg';

const NEON_URL = 'postgresql://neondb_owner:npg_qLuXzef3bah4@ep-round-art-asyh88wq-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const ORPHAN_IDS = [2580, 2581, 2582, 2585, 2586, 2587];

const pgClient = new pg.Client({ connectionString: NEON_URL });
await pgClient.connect();

const neonRes = await pgClient.query(`
  SELECT * FROM "User" WHERE "numericId" IN (${ORPHAN_IDS.join(',')})
`);

console.log(`Found ${neonRes.rowCount} orphan users to sync\n`);

for (const u of neonRes.rows) {
  console.log(`--- Syncing numId=${u.numericId} (${u.email}) ---`);
  
  // Convert timestamp to Unix ms (Neon returns Date object, D1 wants integer ms)
  const createdAtMs = u.createdAt instanceof Date ? u.createdAt.getTime() : Date.now();
  const updatedAtMs = u.updatedAt instanceof Date ? u.updatedAt.getTime() : Date.now();
  const emailVerifiedAtMs = u.emailVerifiedAt instanceof Date ? u.emailVerifiedAt.getTime() : null;
  
  // Build INSERT statement for D1
  // Use the same columns as register/route.ts
  const insertSQL = `
    INSERT OR IGNORE INTO User (
      id, email, passwordHash, firstName, lastName, role, status,
      emailVerifiedAt, preferredLang, slug, numericId, createdAt, updatedAt, passwordChangedAt
    ) VALUES (
      '${u.id.replace(/'/g, "''")}',
      '${u.email.replace(/'/g, "''")}',
      '${(u.passwordHash || '').replace(/'/g, "''")}',
      ${u.firstName ? `'${u.firstName.replace(/'/g, "''")}'` : "''"},
      ${u.lastName ? `'${u.lastName.replace(/'/g, "''")}'` : "''"},
      '${u.role}',
      '${u.status}',
      ${emailVerifiedAtMs || 'NULL'},
      '${u.preferredLang || 'fr'}',
      '${(u.slug || '').replace(/'/g, "''")}',
      ${u.numericId},
      ${createdAtMs},
      ${updatedAtMs},
      ${createdAtMs}
    )
  `;
  
  try {
    const result = execSync(
      `npx wrangler d1 execute examanet-db --config wrangler.prod.jsonc --remote --command "${insertSQL.replace(/"/g, '\\"').replace(/\n/g, ' ')}" 2>&1 | tail -5`,
      { encoding: 'utf-8', cwd: '/workspace/edutunisie/.worktrees/cloudflare-poc' }
    );
    if (result.includes('"success": true') || result.includes('executed successfully')) {
      console.log(`  ✓ Synced to D1`);
    } else if (result.includes('UNIQUE') || result.includes('constraint')) {
      console.log(`  ⚠ Already exists in D1 (UNIQUE constraint)`);
    } else {
      console.log(`  ? ${result.split('\n').filter(l => l.trim()).slice(-3).join(' | ')}`);
    }
  } catch (e) {
    console.log(`  ✗ Error: ${e.message.split('\n')[0]}`);
  }
  console.log('');
}

await pgClient.end();
console.log('Done!');

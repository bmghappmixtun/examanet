// Check if the new Neon users exist in D1
import { execSync } from 'child_process';

const NEON_NEW_USERS = [
  // email, numericId, role
  ['nourelhouda.by0405@gmail.com', 2590, 'STUDENT'],
  ['bsfamna@gmail.com', 2589, 'STUDENT'],
  ['bannourghizaoui@gmail.com', 2588, 'STUDENT'],
  ['majd.lefi@gmail.com', 2587, 'STUDENT'],
  ['othmanritej420@gmail.com', 2586, 'STUDENT'],
  ['mezzizouheir@yahoo.fr', 2585, 'TEACHER'],
  ['farahmelki055@gmail.com', 2584, 'STUDENT'],
  ['rayenbenamor836@gmail.com', 2583, 'TEACHER'],
  ['kraiemharoun459@gmail.com', 2582, 'STUDENT'],
  ['youssefouni615@gmail.com', 2581, 'STUDENT'],
  ['zouabions@gmail.com', 2580, 'STUDENT'],
  ['fatmazahrakacem6@gmail.com', 2579, 'STUDENT'],
  ['soumayaa999@gmail.com', 2578, 'STUDENT'],
  ['takwadhifi219@gmail.com', 2577, 'TEACHER'],
  ['jmelsarah919@gmail.com', 2576, 'TEACHER'],
];

console.log(`Checking ${NEON_NEW_USERS.length} users in D1...\n`);

for (const [email, numericId, role] of NEON_NEW_USERS) {
  // Query D1 for this user
  const sql = `SELECT id, email, firstName, lastName, role, numericId FROM User WHERE email = '${email.replace(/'/g, "''")}' OR numericId = ${numericId} LIMIT 1`;
  try {
    const result = execSync(
      `npx wrangler d1 execute examanet-db --config wrangler.prod.jsonc --remote --command "${sql.replace(/"/g, '\\"')}" --json 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30000, cwd: '/workspace/edutunisie/.worktrees/cloudflare-poc' }
    );
    
    // Parse result
    const match = result.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      const data = JSON.parse(match[0]);
      if (data[0]?.results?.length > 0) {
        const u = data[0].results[0];
        console.log(`  ✓ ${email.padEnd(35)} numId=${u.numericId}  role=${u.role}  (${u.firstName} ${u.lastName})`);
      } else {
        console.log(`  ✗ ${email.padEnd(35)} NOT FOUND in D1 ⚠️`);
      }
    } else {
      console.log(`  ? ${email.padEnd(35)} Could not parse response`);
    }
  } catch (e) {
    console.log(`  ✗ ${email.padEnd(35)} Error: ${e.message.split('\n')[0]}`);
  }
}

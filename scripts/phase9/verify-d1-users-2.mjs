import { execSync } from 'child_process';

const USERS = [
  // [email, numericId, role, neonName]
  ['nourelhouda.by0405@gmail.com', 2590, 'STUDENT', 'Nour BenYounes'],
  ['bsfamna@gmail.com', 2589, 'STUDENT', 'SF Emna'],
  ['bannourghizaoui@gmail.com', 2588, 'STUDENT', 'Rimes ghizaoui'],
  ['majd.lefi@gmail.com', 2587, 'STUDENT', 'Majd LEFI'],
  ['othmanritej420@gmail.com', 2586, 'STUDENT', 'othman ritej'],
  ['mezzizouheir@yahoo.fr', 2585, 'TEACHER', 'Zouhaeir Mezzi'],
  ['farahmelki055@gmail.com', 2584, 'STUDENT', 'Farah Melki'],
  ['rayenbenamor836@gmail.com', 2583, 'TEACHER', 'Benamor Rayen'],
  ['kraiemharoun459@gmail.com', 2582, 'STUDENT', 'Kraiem Haroun'],
  ['youssefouni615@gmail.com', 2581, 'STUDENT', 'Ouni Youssef'],
  ['zouabions@gmail.com', 2580, 'STUDENT', 'Ons Zouabi'],
  ['fatmazahrakacem6@gmail.com', 2579, 'STUDENT', 'Loujayne Kacem'],
  ['soumayaa999@gmail.com', 2578, 'STUDENT', 'Ikbel Ahmed'],
  ['takwadhifi219@gmail.com', 2577, 'TEACHER', 'Takwa Dhifi'],
  ['jmelsarah919@gmail.com', 2576, 'TEACHER', 'alouini sarra'],
];

function queryD1(sql) {
  try {
    const result = execSync(
      `npx wrangler d1 execute examanet-db --config wrangler.prod.jsonc --remote --command "${sql.replace(/"/g, '\\"')}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30000, cwd: '/workspace/edutunisie/.worktrees/cloudflare-poc' }
    );
    // Extract JSON from output
    const match = result.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (match) {
      const data = JSON.parse(match[0]);
      return data[0]?.results || [];
    }
  } catch (e) {
    return null;
  }
  return [];
}

console.log('=== Verify each Neon user in D1 (by email AND by numericId) ===\n');

let missing = 0;
let found = 0;

for (const [email, numericId, role, neonName] of USERS) {
  // Query by email
  const sqlEmail = `SELECT id, email, firstName, lastName, role, numericId FROM User WHERE email = '${email.replace(/'/g, "''")}' LIMIT 1`;
  const byEmail = queryD1(sqlEmail);
  
  // Query by numericId
  const sqlNum = `SELECT id, email, firstName, lastName, role, numericId FROM User WHERE numericId = ${numericId} LIMIT 1`;
  const byNum = queryD1(sqlNum);
  
  const result = byEmail?.[0] || byNum?.[0];
  if (result) {
    found++;
    const nameMatch = (result.firstName + ' ' + result.lastName).trim() === neonName.trim();
    const matchIcon = nameMatch ? '✓' : '⚠';
    console.log(`  ${matchIcon} numId=${numericId.toString().padEnd(5)} ${email.padEnd(35)} D1=(${result.firstName} ${result.lastName})  role=${result.role}`);
  } else {
    missing++;
    console.log(`  ✗ numId=${numericId.toString().padEnd(5)} ${email.padEnd(35)} NOT IN D1 ⚠️`);
  }
}

console.log(`\n=== Summary: ${found} found in D1, ${missing} missing ===`);

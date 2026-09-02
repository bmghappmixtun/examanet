require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient({ log: ['error'] });

(async () => {
  const admin = await p.user.findFirst({ where: { role: 'ADMIN' } });
  const ORIGINAL_HASH = admin.passwordHash;
  const TEST_OLD_PASSWORD = 'TestOldPwd#2026';
  const TEST_NEW_PASSWORD = 'TestNewPwd#2026';
  
  console.log('=== PASSWORD CHANGE BUG TEST ===\n');
  
  // Step 1: Set a known "old" password
  const oldHash = await bcrypt.hash(TEST_OLD_PASSWORD, 10);
  await p.user.update({
    where: { id: admin.id },
    data: { passwordHash: oldHash, failedLoginCount: 0, lockedUntil: null },
  });
  console.log(`[1] Set OLD password to: "${TEST_OLD_PASSWORD}"`);
  console.log(`    DB hash: ${oldHash.substring(0, 30)}...`);
  
  // Step 2: Verify login works with old password
  const u1 = await p.user.findUnique({ where: { email: admin.email } });
  const works1 = await bcrypt.compare(TEST_OLD_PASSWORD, u1.passwordHash);
  console.log(`[2] Login with OLD password: ${works1 ? '✓ SUCCESS' : '✗ FAIL'}`);
  
  // Step 3: Simulate the change-password flow
  const newHash = await bcrypt.hash(TEST_NEW_PASSWORD, 10);
  await p.user.update({
    where: { id: admin.id },
    data: { passwordHash: newHash, failedLoginCount: 0, lockedUntil: null },
  });
  console.log(`[3] Changed password to: "${TEST_NEW_PASSWORD}"`);
  console.log(`    DB hash: ${newHash.substring(0, 30)}...`);
  
  // Step 4: Verify login still works with OLD password (this is the bug test)
  const u2 = await p.user.findUnique({ where: { email: admin.email } });
  const oldStillWorks = await bcrypt.compare(TEST_OLD_PASSWORD, u2.passwordHash);
  const newWorks = await bcrypt.compare(TEST_NEW_PASSWORD, u2.passwordHash);
  console.log(`[4] Login with OLD password: ${oldStillWorks ? '✗ STILL WORKS (BUG!)' : '✓ CORRECTLY REJECTED'}`);
  console.log(`    Login with NEW password: ${newWorks ? '✓ SUCCESS' : '✗ FAIL'}`);
  
  // Step 5: Restore original hash
  await p.user.update({
    where: { id: admin.id },
    data: { passwordHash: ORIGINAL_HASH, failedLoginCount: 0, lockedUntil: null },
  });
  console.log(`\n[5] Restored original hash.`);
  console.log('=== TEST COMPLETE ===');
  
  await p.$disconnect();
})();

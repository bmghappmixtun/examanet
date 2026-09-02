const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // 1. Delete old test users (created > 1h ago, status PENDING_OTP, email ends with @example.com or test)
  const testUsers = await p.user.deleteMany({
    where: {
      status: 'PENDING_OTP',
      email: { endsWith: '@example.com' },
      createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) }
    }
  });
  console.log('✅ Deleted old test PENDING_OTP accounts:', testUsers.count);

  // 2. Cleanup expired OTPs (older than 1 day)
  const oldOtps = await p.otpCode.deleteMany({
    where: {
      expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  });
  console.log('✅ Deleted expired OTPs:', oldOtps.count);

  // 3. Specifically delete boutiti.mehdi@yandex.com (different email from real account)
  const yandexUser = await p.user.deleteMany({
    where: { email: 'boutiti.mehdi@yandex.com' }
  });
  console.log('✅ Deleted yandex account:', yandexUser.count);

  // 4. Stats after cleanup
  const total = await p.user.count();
  const byStatus = await p.user.groupBy({ by: ['status'], _count: true });
  console.log('\nAfter cleanup:');
  console.log('  Total users:', total);
  console.log('  By status:', byStatus);

  await p.$disconnect();
})();

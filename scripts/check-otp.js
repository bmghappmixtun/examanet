const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  // Most recent users (any status) created today
  const recent = await p.user.findMany({
    where: { 
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
    },
    take: 15,
    orderBy: { createdAt: 'desc' },
    select: { 
      id: true, 
      email: true, 
      firstName: true, 
      role: true, 
      status: true, 
      createdAt: true,
      emailVerifiedAt: true,
      otpCodes: { 
        orderBy: { createdAt: 'desc' }, 
        take: 1, 
        select: { code: true, expiresAt: true, attempts: true, consumedAt: true, createdAt: true } 
      } 
    }
  });
  console.log('Recent users (24h):');
  for (const u of recent) {
    const otp = u.otpCodes[0];
    const expired = otp ? new Date(otp.expiresAt) < new Date() : null;
    console.log(`  ${u.email}`);
    console.log(`    status: ${u.status} | verified: ${u.emailVerifiedAt ? 'YES' : 'NO'} | role: ${u.role}`);
    console.log(`    created: ${u.createdAt.toISOString()}`);
    if (otp) {
      console.log(`    OTP: ${otp.code} | expires: ${otp.expiresAt.toISOString()} | ${expired ? '❌ EXPIRED' : '✅ valid'} | attempts: ${otp.attempts} | consumed: ${otp.consumedAt ? 'YES' : 'NO'}`);
    } else {
      console.log(`    No OTP`);
    }
  }
  
  console.log('\n--- Stats ---');
  const total = await p.user.count();
  const byStatus = await p.user.groupBy({ by: ['status'], _count: true });
  console.log('Total users:', total);
  console.log('By status:', byStatus);
  
  await p.$disconnect();
})();

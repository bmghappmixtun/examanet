require('dotenv').config({ path: '/workspace/edutunisie/.env.local' });
console.log('DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 50));
const { PrismaClient } = require('/workspace/edutunisie/node_modules/@prisma/client');
const p = new PrismaClient({ log: ['error'] });
(async () => {
  try {
    const r = await p.$queryRaw`SELECT 1 as ok`;
    console.log('OK:', r);
  } catch (e) {
    console.log('ERR:', e.message);
  }
  await p.$disconnect();
})();

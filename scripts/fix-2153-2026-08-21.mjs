#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function main() {
  // Restore #2153 Mohamed Hedi Taabouri
  const t = await p.user.findFirst({ where: { numericId: 2153 } });
  console.log('Before:', t.firstName, t.lastName, t.firstNameAr, t.lastNameAr);
  
  await p.user.updateMany({
    where: { numericId: 2153 },
    data: {
      firstName: 'Mohamed Hedi',
      firstNameAr: 'محمد هادي',
      lastNameAr: 'التابوري',
    }
  });
  
  const after = await p.user.findFirst({ where: { numericId: 2153 } });
  console.log('After:', after.firstName, after.lastName, after.firstNameAr, after.lastNameAr);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });

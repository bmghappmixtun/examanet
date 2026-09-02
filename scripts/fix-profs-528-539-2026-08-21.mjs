#!/usr/bin/env node
/**
 * Fix profs #528 and #539 with user-provided names (2026-08-21)
 * 
 * User feedback 2026-08-20: '539 : Miss Jabri Nadia / 528 : Mr Othmani'
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
  // #528: Mr Othmani
  await p.user.updateMany({
    where: { numericId: 528 },
    data: {
      firstName: null,
      lastName: 'Othmani',
      firstNameAr: null,
      lastNameAr: 'العثماني'
    }
  });
  console.log('#528: Mr Othmani → FR "" "Othmani" / AR "" "العثماني"');

  // #539: Miss Jabri Nadia
  await p.user.updateMany({
    where: { numericId: 539 },
    data: {
      firstName: 'Nadia',
      lastName: 'Jabri',
      firstNameAr: 'نادية',
      lastNameAr: 'جابري'
    }
  });
  console.log('#539: Miss Jabri Nadia → FR "Nadia" "Jabri" / AR "نادية" "جابري"');
}
main().then(() => p.$disconnect());

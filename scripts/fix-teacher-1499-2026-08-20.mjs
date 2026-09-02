#!/usr/bin/env node
/**
 * Fix #1499: lastNameAr 'الدبيبيا' → 'الدبيبية' (2026-08-20)
 * 
 * User feedback 2026-08-19: 'محمد علي الدبيبية'
 * 
 * The correct AR surname is 'الدبيبية' (with tāʾ marbūṭa ة),
 * not 'الدبيبيا' (without ة). 'الدبيبية' is the feminine form
 * which is the correct form for a Tunisian family name.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
async function main() {
  const r = await p.user.updateMany({
    where: { numericId: 1499 },
    data: { lastNameAr: 'الدبيبية' }
  });
  console.log('Updated:', r.count);
}
main().then(() => p.$disconnect());

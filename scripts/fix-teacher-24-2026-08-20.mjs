#!/usr/bin/env node
/**
 * Fix #24: 'El Fekih' / 'Nader' → 'Nader' / 'El Fekih' (2026-08-20)
 * 
 * User feedback 2026-08-19: "en arabe c est نادر الفقيه"
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
async function main() {
  const r = await p.user.updateMany({
    where: { numericId: 24 },
    data: {
      firstName: 'Nader',
      lastName: 'El Fekih',
      firstNameAr: 'نادر',
      lastNameAr: 'الفقيه',
    }
  });
  console.log('Updated:', r.count);
}
main().then(() => p.$disconnect());

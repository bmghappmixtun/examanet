#!/usr/bin/env node
/**
 * Fix #126: swap FR/AR to match 'المولدي قوي' (2026-08-20)
 * 
 * User feedback 2026-08-19: "المولدي قوي"
 * 
 * The AR convention is given-name-first. For this prof, المولدي
 * is the given name and قوي is the surname. The FR was in the
 * wrong order ('Goui MOULDI') — swapped to match.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
async function main() {
  const r = await p.user.updateMany({
    where: { numericId: 126 },
    data: {
      firstName: 'Mouldi',
      lastName: 'Goui',
      firstNameAr: 'المولدي',
      lastNameAr: 'قوي',
    }
  });
  console.log('Updated:', r.count);
}
main().then(() => p.$disconnect());

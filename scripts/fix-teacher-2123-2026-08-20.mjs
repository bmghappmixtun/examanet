#!/usr/bin/env node
/**
 * Fix #2123: lastNameAr 'الغوربلي' → 'غربالي' (2026-08-20)
 * 
 * User feedback 2026-08-19: "https://examanet.com/fr/professeurs/2123/ghorbeli-med-hedi
 * غربالي"
 * 
 * The AR transliteration of 'Ghorbeli' is 'غربالي' (without 'ال' prefix and
 * different spelling). The user confirmed this is the correct AR surname.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
async function main() {
  const r = await p.user.updateMany({
    where: { numericId: 2123 },
    data: { lastNameAr: 'غربالي' }
  });
  console.log('Updated:', r.count);
}
main().then(() => p.$disconnect());

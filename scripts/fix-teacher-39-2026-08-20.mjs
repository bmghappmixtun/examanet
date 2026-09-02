#!/usr/bin/env node
/**
 * Fix #39: firstNameAr 'براهيم سدكي' → 'إبراهيم صدقي' (2026-08-20)
 * 
 * User feedback 2026-08-19: "إبراهيم صدقي الزاق"
 * 
 * Two corrections to the AR:
 * 1. 'براهيم' → 'إبراهيم' (proper AR form of Ibrahim, with alif under hamza)
 * 2. 'سدكي' → 'صدقي' (proper AR form of Sedqi)
 * 
 * The firstName is a compound: 'إبراهيم صدقي' (full given name with middle name)
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
async function main() {
  const r = await p.user.updateMany({
    where: { numericId: 39 },
    data: {
      firstNameAr: 'إبراهيم صدقي',
    }
  });
  console.log('Updated:', r.count);
}
main().then(() => p.$disconnect());

#!/usr/bin/env node
/**
 * Fix #955: 'Mohamed Faycel' → 'Faycel' (2026-08-20)
 * 
 * User feedback 2026-08-19: "https://examanet.com/fr/professeurs/955/tlili-med-faycel
 * فيصل" (just Faycel, no Mohamed)
 * 
 * Original was 'Med. Faycel' — the 'Med.' was actually a separator/abbreviation
 * that the user clarified is NOT 'Mohamed' but a separator. The actual firstName
 * is just 'Faycel' (فيصل).
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
async function main() {
  const r = await p.user.updateMany({
    where: { numericId: 955 },
    data: {
      firstName: 'Faycel',
      firstNameAr: 'فيصل',
    }
  });
  console.log('Updated:', r.count);
}
main().then(() => p.$disconnect());

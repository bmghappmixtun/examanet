#!/usr/bin/env node
/**
 * Fix teacher profile #2007: Mohsen Chaieb (2026-08-19)
 *
 * User feedback 2026-08-19: 'ce prof ... s'appele Mohsen Chaieb
 * en fr et محسن الشايب en ar'
 *
 * The teacher profile was missing the last name (just an em-dash
 * placeholder) and had no Arabic names set. Updated:
 * - firstName: 'Mohsen' (kept)
 * - lastName: '—' → 'Chaieb'
 * - firstNameAr: null → 'محسن'
 * - lastNameAr: null → 'الشايب'
 * - slug: 'mohsen-' → 'mohsen-chaieb' (so the new URL is
 *   /fr/professeurs/2007/mohsen-chaieb)
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
(async () => {
  const t = await p.user.findFirst({ where: { numericId: 2007 } });
  if (!t) { console.log('Teacher #2007 not found'); return; }
  await p.user.update({
    where: { id: t.id },
    data: {
      firstName: 'Mohsen',
      lastName: 'Chaieb',
      firstNameAr: 'محسن',
      lastNameAr: 'الشايب',
      slug: 'mohsen-chaieb',
    }
  });
  console.log('✅ Teacher #2007 updated');
  await p.$disconnect();
})();

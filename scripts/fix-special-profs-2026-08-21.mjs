#!/usr/bin/env node
/**
 * Fix special prof cases (2026-08-21)
 * 
 * #459 "boumnigel soufien" → names were SWAPPED.
 *   Resource profNames: ["سفيان بومنيجل"] = "Soufien Boumnigel"
 *   Fix: firstName="soufien" lastName="boumnigel" / AR "سفيان" "بومنيجل"
 * 
 * #595 "Thénardier Thénardier" → profNames = "" but PDF title says "Mr Gassoumi Mohamed"
 *   Fix: firstName="Mohamed" lastName="Gassoumi" / AR "محمد" "القسومي"
 * 
 * #1822 "Ali Samaali" → no PDF info, left as-is
 * #230 "Tlili Basset Tlili" → might be correct (Basset is a patronymic), left as-is
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
  // #459: swap first/last
  const before459 = await p.user.findFirst({ where: { numericId: 459 } });
  console.log('#459 BEFORE: "' + before459?.firstName + '" "' + before459?.lastName + '" / AR "' + (before459?.firstNameAr||'') + '" "' + (before459?.lastNameAr||'') + '"');
  await p.user.updateMany({
    where: { numericId: 459 },
    data: { firstName: 'soufien', lastName: 'boumnigel', firstNameAr: 'سفيان', lastNameAr: 'بومنيجل' }
  });
  const after459 = await p.user.findFirst({ where: { numericId: 459 } });
  console.log('#459 AFTER:  "' + after459?.firstName + '" "' + after459?.lastName + '" / AR "' + (after459?.firstNameAr||'') + '" "' + (after459?.lastNameAr||'') + '"');

  // #595: change from Thénardier to Gassoumi Mohamed
  const before595 = await p.user.findFirst({ where: { numericId: 595 } });
  console.log('\n#595 BEFORE: "' + before595?.firstName + '" "' + before595?.lastName + '" / AR "' + (before595?.firstNameAr||'') + '" "' + (before595?.lastNameAr||'') + '"');
  await p.user.updateMany({
    where: { numericId: 595 },
    data: { firstName: 'Mohamed', lastName: 'Gassoumi', firstNameAr: 'محمد', lastNameAr: 'القسومي' }
  });
  const after595 = await p.user.findFirst({ where: { numericId: 595 } });
  console.log('#595 AFTER:  "' + after595?.firstName + '" "' + after595?.lastName + '" / AR "' + (after595?.firstNameAr||'') + '" "' + (after595?.lastNameAr||'') + '"');
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });

#!/usr/bin/env node
/**
 * Apply 21 new AR names found via fullText + profNames (2026-08-20)
 * 
 * User feedback 2026-08-19: "Appliquer les 21 nouveaux (5 fullText + 16 profNames
 * qu'on avait ratés)"
 * 
 * Each was manually verified for 1:1 FR↔AR correspondence (no corruption,
 * no generic 'أستاذ X', no duplicates, no OCR errors).
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const safeNew = [
  { id: 15,   firstNameAr: 'سامي',      lastNameAr: 'الزواري' },
  { id: 81,   firstNameAr: 'بدرالدين',  lastNameAr: 'الطرابلسي' },
  { id: 158,  firstNameAr: 'فوزي',      lastNameAr: 'عدوني' },
  { id: 263,  firstNameAr: 'رجاء',      lastNameAr: 'عون الله' },
  { id: 266,  firstNameAr: 'نور الدين', lastNameAr: 'عاشور' },
  { id: 392,  firstNameAr: 'زهير',      lastNameAr: null },
  { id: 497,  firstNameAr: 'فتحي',      lastNameAr: 'الخميري' },
  { id: 714,  firstNameAr: 'مهدي',      lastNameAr: 'موسى' },
  { id: 719,  firstNameAr: 'عبدالوهاب', lastNameAr: 'عربي' },
  { id: 730,  firstNameAr: 'مروان',     lastNameAr: 'الزعفوري' },
  { id: 733,  firstNameAr: 'عبدالستار', lastNameAr: 'شهلول' },
  { id: 850,  firstNameAr: 'طاهر',      lastNameAr: 'عثمان' },
  { id: 853,  firstNameAr: 'المختار',   lastNameAr: 'السّالمي' },
  { id: 872,  firstNameAr: 'رفيق',      lastNameAr: 'الطباخ' },
  { id: 59,   firstNameAr: 'عماد',      lastNameAr: 'الناصر' },
  { id: 97,   firstNameAr: 'عوالي',     lastNameAr: null },
  { id: 10,   firstNameAr: 'محمد',      lastNameAr: 'العيادي' },
  { id: 88,   firstNameAr: 'عفيفي',     lastNameAr: null },
  { id: 587,  firstNameAr: 'آمنة',      lastNameAr: 'العيادي' },
  { id: 265,  firstNameAr: 'خليفة',     lastNameAr: 'شبيل' },
  { id: 643,  firstNameAr: 'شكري',      lastNameAr: 'الكافي' },
];

async function main() {
  let updated = 0;
  for (const s of safeNew) {
    const r = await p.user.updateMany({
      where: { numericId: s.id },
      data: { firstNameAr: s.firstNameAr, lastNameAr: s.lastNameAr }
    });
    updated += r.count;
  }
  console.log('Applied:', updated, '/', safeNew.length);
}
main().then(() => p.$disconnect());

#!/usr/bin/env node
/**
 * Fix "Med" abbreviation → "Mohamed" (2026-08-20)
 * 
 * "Med" is the abbreviation of "Mohamed" (محمد) in Tunisian names.
 * "Med Ali" = "Mohamed Ali" (محمد علي), "Med Salah" = "Mohamed Salah", etc.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const fixes = [
  { id: 2153, fn: 'Mohamed Hedi',   fnAr: 'محمد هادي',  ln: 'Taabouri',  lnAr: 'التابوري' },
  { id: 955,  fn: 'Mohamed Faycel', fnAr: 'محمد فايصل', ln: 'Tlili',     lnAr: 'التليلي' },
  { id: 2123, fn: 'Mohamed Hedi',   fnAr: 'محمد هادي',  ln: 'Ghorbeli',  lnAr: 'الغوربلي' },
  { id: 453,  fn: 'Akrimi',         fnAr: 'Akrimi',     ln: 'Mohamed Hédi', lnAr: 'محمد هادي' },
  { id: 460,  fn: 'dabbabi',        fnAr: 'dabbabi',    ln: 'Mohamed Azouzi', lnAr: 'محمد عزوزي' },
  { id: 155,  fn: 'hamdi',          fnAr: 'hamdi',      ln: 'Mohamed Lazhar', lnAr: 'محمد لزهر' },
  { id: 1468, fn: 'Mohamed',        fnAr: 'محمد',      ln: 'Ben Mohamed',  lnAr: 'بن محمد' },
  { id: 1728, fn: 'Mohamed Ali',    fnAr: 'محمد علي',  ln: 'Hamadi',    lnAr: 'الهامادي' },
  { id: 2305, fn: 'Mohamed Ali',    fnAr: 'محمد علي',  ln: 'Missaoui',  lnAr: 'الميسساوي' },
  { id: 1452, fn: 'Mohamed Habib',  fnAr: 'محمد الحبيب', ln: 'Mâalej',   lnAr: 'المالج' },
  { id: 1434, fn: 'Mohamed Ouardia', fnAr: 'محمد وردية', ln: 'Brahim',  lnAr: 'البراهيم' },
  { id: 1499, fn: 'Mohamed Ali',    fnAr: 'محمد علي',  ln: 'Dbeibia',  lnAr: 'الدبيبيا' },
  { id: 438,  fn: 'Harizi',         fnAr: 'حريزي',     ln: 'Mohamed Salah', lnAr: 'محمد صالح' },
];

async function main() {
  let updated = 0;
  for (const f of fixes) {
    try {
      const before = await p.user.findFirst({ where: { numericId: f.id } });
      const r = await p.user.updateMany({
        where: { numericId: f.id },
        data: { firstName: f.fn, lastName: f.ln, firstNameAr: f.fnAr, lastNameAr: f.lnAr }
      });
      updated += r.count;
      console.log('  #' + f.id + ': \"' + (before?.firstName || '') + '\" \"' + (before?.lastName || '') + '\" / \"' + (before?.firstNameAr || '') + '\" \"' + (before?.lastNameAr || '') + '\"');
      console.log('       → \"' + f.fn + '\" \"' + f.ln + '\" / \"' + f.fnAr + '\" \"' + f.lnAr + '\"');
    } catch (e) {
      console.log('  Error #' + f.id + ': ' + e.message.substring(0, 80));
    }
  }
  console.log('\\n✅ Updated:', updated, '/', fixes.length);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });

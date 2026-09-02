#!/usr/bin/env node
/**
 * Corrections de types de fichiers AR lycée (2026-08-19)
 *
 * Suite à revue user, plusieurs fichiers avaient un type incorrect
 * (DEVOIR_CONTROLE vs DEVOIR_SYNTHESE vs EXERCISE vs OTHER). On
 * corrige les 4 cas + supprime 1 doublon.
 *
 * Changes:
 * - #4257: DEVOIR_CONTROLE → DEVOIR_SYNTHESE (n°1)
 * - #7814: EXERCISE → DEVOIR_SYNTHESE (n°2)
 * - #4604: OTHER → DEVOIR_CONTROLE (n°1) — kept version
 * - #13396: deleted (duplicate of #4604, same content, different source)
 *
 * Then run retitle-multi.mjs to regenerate titles.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const arabicMap = { 'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h' };
function properSlugify(text, maxLen) {
  let s = text.replace(/[\u0600-\u06FF]/g, c => arabicMap[c] || '');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  s = s.replace(/^-+|-+$/g, '');
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/, '');
  return s;
}

const FIXES = [
  {
    id: 4257,
    title: 'فرض تأليفي عدد 1 - التاريخ - الأولى ثانوي (2022-2023) : إفريقيا البرتغالية',
    type: 'HOMEWORK',
    homeworkNumber: 1,
    headerType: 'DEVOIR_SYNTHESE',
    headerSubtype: 'SYNTHESIS',
    metaType: 'devoir',
    metaSubtype: 'synthèse',
  },
  {
    id: 7814,
    title: 'فرض تأليفي عدد 2 - التاريخ - الأولى ثانوي (2009-2010) : إنجاز خريطة',
    type: 'HOMEWORK',
    homeworkNumber: 2,
    headerType: 'DEVOIR_SYNTHESE',
    headerSubtype: 'SYNTHESIS',
    metaType: 'devoir',
    metaSubtype: 'synthèse',
  },
  {
    id: 4604,
    title: 'فرض مراقبة عدد 1 - التاريخ - الأولى ثانوي (2018-2019) : فترة ما قبل التاريخ',
    type: 'HOMEWORK',
    homeworkNumber: 1,
    headerType: 'DEVOIR_CONTROLE',
    headerSubtype: 'CONTROL',
    metaType: 'devoir',
    metaSubtype: 'contrôle',
  },
];

const DELETIONS = [
  { id: 13396, reason: 'duplicate of #4604 (same content, jimdo-quad3 source vs duty-yassi source)' },
];

async function main() {
  for (const fix of FIXES) {
    const r = await p.resource.findFirst({ 
      where: { numericId: fix.id },
      include: { metadata: true }
    });
    if (!r) { console.log(`#${fix.id} not found`); continue; }
    const newSlug = properSlugify(fix.title, 80) + '-' + fix.id;
    await p.resource.update({
      where: { id: r.id },
      data: { title: fix.title, slug: newSlug, type: fix.type, homeworkNumber: fix.homeworkNumber }
    });
    const hd = r.headerData || {};
    hd.type = fix.headerType;
    hd.homeworkSubtype = fix.headerSubtype;
    await p.resource.update({ where: { id: r.id }, data: { headerData: hd } });
    if (r.metadata) {
      await p.resourceMetadata.update({
        where: { resourceId: r.id },
        data: { type: fix.metaType, subtype: fix.metaSubtype }
      });
    }
    console.log(`✅ #${fix.id}: ${fix.headerType}${fix.homeworkNumber ? ' n°' + fix.homeworkNumber : ''}`);
  }
  
  for (const del of DELETIONS) {
    const r = await p.resource.findFirst({ where: { numericId: del.id } });
    if (!r) { console.log(`#${del.id} not found`); continue; }
    await p.resourceMetadata.deleteMany({ where: { resourceId: r.id } });
    await p.resourceContent.deleteMany({ where: { resourceId: r.id } });
    await p.view.deleteMany({ where: { resourceId: r.id } });
    await p.download.deleteMany({ where: { resourceId: r.id } });
    await p.favorite.deleteMany({ where: { resourceId: r.id } });
    await p.resourceSummary.deleteMany({ where: { resourceId: r.id } });
    await p.report.deleteMany({ where: { resourceId: r.id } });
    await p.rating.deleteMany({ where: { resourceId: r.id } });
    await p.resource.delete({ where: { id: r.id } });
    console.log(`🗑️ #${del.id} deleted: ${del.reason}`);
  }
}

main()
  .then(() => p.$disconnect())
  .catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });

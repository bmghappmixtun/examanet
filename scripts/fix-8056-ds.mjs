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
async function main() {
  const r = await p.resource.findFirst({ where: { numericId: 8056 }, include: { metadata: true } });
  if (!r) { console.log('Not found'); return; }
  console.log('Current:');
  console.log('  title:', r.title);
  console.log('  type:', r.type, '| hn:', r.homeworkNumber);
  console.log('  hd.type:', r.headerData?.type);
  console.log('  gs:', r.metadata?.generalSubject);
  
  const newTitle = 'اختبار تأليفي عدد 1 - التفكير الإسلامي - الرابعة ثانوي - شعبة الآداب (2016-2017) : ' + r.metadata.generalSubject;
  const newSlug = properSlugify(newTitle, 80) + '-8056';
  
  await p.resource.update({
    where: { id: r.id },
    data: { title: newTitle, slug: newSlug, type: 'HOMEWORK', homeworkNumber: 1 }
  });
  const hd = r.headerData || {};
  hd.type = 'DEVOIR_SYNTHESE';
  hd.homeworkSubtype = 'SYNTHESIS';
  await p.resource.update({ where: { id: r.id }, data: { headerData: hd } });
  if (r.metadata) {
    await p.resourceMetadata.update({
      where: { resourceId: r.id },
      data: { type: 'devoir', subtype: 'synthèse' }
    });
  }
  console.log('\n✅ #8056:');
  console.log('   type: DEVOIR_CONTROLE → DEVOIR_SYNTHESE');
  console.log('   title:', newTitle);
}
main().then(() => p.$disconnect()).catch(e => { console.error(e); p.$disconnect(); process.exit(1); });

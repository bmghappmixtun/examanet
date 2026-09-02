#!/usr/bin/env node
/**
 * Bulk reclassification: Géographie → SVT for 4 fichiers (2026-08-19)
 *
 * User feedback 2026-08-19: AI misclassified these as Geography but
 * the content is actually SVT (Sciences de la Vie et de la Terre).
 * Also: #13419 and #5009 should be 'devoir de synthèse' (was contrôle).
 * #7811 was 'série d'exercices' but should be 'devoir de contrôle n°1'.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const arabicMap = { 'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h' };
const properSlugify = (text, maxLen) => {
  let s = text.replace(/[\u0600-\u06FF]/g, c => arabicMap[c] || '');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  s = s.replace(/^-+|-+$/g, '');
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/, '');
  return s;
};

const FIXES = [
  // #13419: géo → géo (subject OK) but type: contrôle → synthèse
  {
    id: 13419,
    newSubject: 'geographie',  // keep
    newSection: 'eco-services', // keep
    newTitle: 'فرض تأليفي عدد 1 - الجغرافيا - الثانية ثانوي - شعبة الاقتصاد والخدمات (2011-2012) : الجاذبية السياحية لباريس',
    type: 'HOMEWORK', homeworkNumber: 1,
    headerType: 'DEVOIR_SYNTHESE', headerSubtype: 'SYNTHESIS',
    metaType: 'devoir', metaSubtype: 'synthèse',
  },
  // #5009: same
  {
    id: 5009,
    newSubject: 'geographie',  // keep
    newSection: 'eco-services', // keep
    newTitle: 'فرض تأليفي عدد 1 - الجغرافيا - الأولى ثانوي - شعبة الاقتصاد والخدمات (2011-2012) : الترتيب الحجمي للمدن',
    type: 'HOMEWORK', homeworkNumber: 1,
    headerType: 'DEVOIR_SYNTHESE', headerSubtype: 'SYNTHESIS',
    metaType: 'devoir', metaSubtype: 'synthèse',
  },
  // #5098: géo → SVT, 1AS = Tronc commun
  {
    id: 5098,
    newSubject: 'svt',
    newSection: null,
    newTitle: 'فرض مراقبة عدد 1 - علوم الحياة والأرض - الأولى ثانوي (2010-2011) : قراءة الخرائط والتضاريس',
    type: 'HOMEWORK', homeworkNumber: 1,
    headerType: 'DEVOIR_CONTROLE', headerSubtype: 'CONTROL',
    metaType: 'devoir', metaSubtype: 'contrôle',
  },
  // #7289: géo → SVT, 2AS = sciences-experimentales
  {
    id: 7289,
    newSubject: 'svt',
    newSection: 'sciences-experimentales',
    newTitle: 'فرض مراقبة عدد 1 - علوم الحياة والأرض - الثانية ثانوي - شعبة العلوم التجريبية (2014-2015) : الخرائط الطبوغرافية والجيولوجية',
    type: 'HOMEWORK', homeworkNumber: 1,
    headerType: 'DEVOIR_CONTROLE', headerSubtype: 'CONTROL',
    metaType: 'devoir', metaSubtype: 'contrôle',
  },
  // #7811: géo → SVT, type: EXERCICE → DEVOIR_CONTROLE n°1
  {
    id: 7811,
    newSubject: 'svt',
    newSection: 'sciences-experimentales',
    newTitle: 'فرض مراقبة عدد 1 - علوم الحياة والأرض - الثانية ثانوي - شعبة العلوم التجريبية (2015-2016) : الزيادة السكانية في كينيا',
    type: 'HOMEWORK', homeworkNumber: 1,
    headerType: 'DEVOIR_CONTROLE', headerSubtype: 'CONTROL',
    metaType: 'devoir', metaSubtype: 'contrôle',
  },
];

async function main() {
  for (const fix of FIXES) {
    const r = await p.resource.findFirst({ where: { numericId: fix.id }, include: { metadata: true } });
    if (!r) { console.log(`#${fix.id} not found`); continue; }
    const subj = await p.subject.findFirst({ where: { slug: fix.newSubject } });
    let secId = r.sectionId;
    if (fix.newSection === null) secId = null;
    else if (fix.newSection) {
      const sec = await p.section.findFirst({ where: { slug: fix.newSection } });
      secId = sec?.id || r.sectionId;
    }
    const newSlug = properSlugify(fix.newTitle, 80) + '-' + fix.id;
    await p.resource.update({
      where: { id: r.id },
      data: {
        title: fix.newTitle, slug: newSlug,
        subjectId: subj.id, sectionId: secId,
        type: fix.type, homeworkNumber: fix.homeworkNumber,
      }
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
}

main()
  .then(() => p.$disconnect())
  .catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });

// 2026-08-19 update: #7815 reclassified class + type
// Was 1AS, DEVOIR_CONTROLE; user says 3AS, DEVOIR_SYNTHESE

// 2026-08-19 update: #13424 reclassified class + type
// Was 1AS, DEVOIR_CONTROLE; user says 2AS eco-services, DEVOIR_SYNTHESE
// NOTE: This file has the same title as #5009 (1AS). Might be a duplicate —
// user can decide if both should remain (same teacher, different class).

// 2026-08-19 update: #13437 + #13904
// #13437: class 1AS → 4AS lettres (was wrongly 1AS)
// #13904: subject géo → SVT, section → sciences-experimentales

// 2026-08-19 update: #13914 reclassified géo → SVT (2AS sciences-exp)

// 2026-08-19 update: #14031 reclassified géo → SVT (2AS sciences-exp)
// Topic 'الجيولوجيا والتضاريس' (geology and topography) is SVT not geography

// 2026-08-19 update: #15349 section eco-services → lettres (2AS)

// 2026-08-19 update: #15348 class 1AS → 2AS (eco-services kept)

// 2026-08-19 update: #15344 type HOMEWORK/DEVOIR_CONTROLE → EXAM (اختبار كتابي)
// User: "اختبار كتابي عدد 2" — written test n°2

// 2026-08-19 update: #8054 class 1AS → 2AS (sciences)
// Note: the title had already been updated to 'التفكير الإسلامي' (new
// subject name) by the retitle-multi.mjs script that I re-ran earlier
// (after fixing SUBJECTS_AR['pensee-islamique'] from 'الفكر الإسلامي'
// to 'التفكير الإسلامي').

// 2026-08-19 update: #14567 type DEVOIR_CONTROLE → DEVOIR_SYNTHESE n°1
// (slug had old subject name 'alfkr-alislamy' from before the retitle
// SUBJECTS_AR fix; now regenerated to new transliteration)

// 2026-08-19 update: #15368 class 1AS → 2AS, type → DS n°1,
// subject name in title/slug updated to 'التفكير الإسلامي'

// 2026-08-19 PI bulk audit: 3 fixes
// #15367 + #8053: 1AS had section 'sciences' — cleared (1AS = Tronc commun)
// #15369: title was 'فرض مراقبة' (DC) but metadata.subtype=SYNTHESE
//         changed to DS (per user pattern, headerData updated too)
// #15370: 3AS + maths section — unusual but left as-is (PI is
//         taught in all sections, not just lettres in Tunisia)

// 2026-08-19: Deleted #9630 (Philosophie 3AS lettres, "المرأة والحرية -
// سيمون دي بوفوار", 2024-2025). User said "supprimer". Orphan PDF
// remains in Vercel Blob (no BLOB_READ_WRITE_TOKEN to clean).

// 2026-08-19 update: #7915 subject philo → français (étude de texte)
// 3AS sciences-experimentales, type DEVOIR_SYNTHESE n°1 kept

// 2026-08-19 update: #3988 philo → français, n° 1 → 2

// 2026-08-19 philo audit: 3 fixes
// #9418: 3AS no section → lettres (3AS philo default section)
// #9629: 3AS eco-services (2AS section) → lettres
// #8047: 3AS sciences-informatique (4AS section) → lettres

// 2026-08-19 update: #8869 education-civique → anglais (user:
// "anglais pas education civique"). 2AS eco-services kept.

// 2026-08-19 update: #8853 education-civique → anglais (same year/teacher
// pattern as #8869 — likely a series of English DC files misclassified)

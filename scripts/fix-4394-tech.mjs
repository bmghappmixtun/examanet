#!/usr/bin/env node
/**
 * Fix #4394 (2026-08-19): wrong subject classification.
 * Was 'Géographie' but actual content is 'Technologie' (car air
 * conditioning system - mechanical/technical content). Reclassified
 * + section updated from 'sciences-experimentales' to 'technique'.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
(async () => {
  const tech = await p.subject.findFirst({ where: { slug: 'technologie' } });
  const techSec = await p.section.findFirst({ where: { slug: 'technique' } });
  const r = await p.resource.findFirst({ where: { numericId: 4394 } });
  if (!r) return;
  const newTitle = 'فرض مراقبة عدد 1 - التكنولوجيا - الرابعة ثانوي - شعبة التقنية (2020-2021) : نظام تكييف السيارات';
  const arabicMap = { 'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h' };
  const properSlugify = (text, maxLen) => {
    let s = text.replace(/[\u0600-\u06FF]/g, c => arabicMap[c] || '');
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    s = s.replace(/^-+|-+$/g, '');
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/, '');
    return s;
  };
  const newSlug = properSlugify(newTitle, 80) + '-4394';
  await p.resource.update({
    where: { id: r.id },
    data: {
      title: newTitle, slug: newSlug,
      subjectId: tech.id, sectionId: techSec?.id || r.sectionId,
      description: r.description.replace(/géographie/gi, 'technologie').replace(/géographique/gi, 'technique'),
    },
  });
  console.log('✅ #4394 fixed');
  await p.$disconnect();
})();

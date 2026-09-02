/**
 * fix-edge-cases.mjs
 *
 * Handle remaining edge cases that the general fix scripts skipped:
 * - "histoires géographie" / "histoire géographie" → "histoire-geographie" subject
 * - Arabic "الرسم التعريفي" (Introduction to drawing) → "arts-plastiques"
 * - "Peinture" / "Dessin" → "arts-plastiques"
 */

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const all = await p.resource.findMany({
  where: { status: 'PUBLISHED' },
  select: { id: true, title: true, subject: { select: { slug: true } } }
});

const subjectMap = {};
const subjects = await p.subject.findMany();
for (const s of subjects) subjectMap[s.slug] = s.id;

let batch = [];
let fixed = 0;

for (const r of all) {
  const t = (r.title || '').toLowerCase();
  const currentSlug = r.subject?.slug;
  let target = null;

  // histoire-géographie
  if (/histoires?\s*g[ée]ographie/.test(t) && currentSlug !== 'histoire-geographie' && subjectMap['histoire-geographie']) {
    target = subjectMap['histoire-geographie'];
  }
  // arts-plastiques (Arabic or French)
  else if ((/الرسم|رسم|arts?\s*plastiques?|^dessin|peinture|drawing/i.test(r.title)) && currentSlug !== 'arts-plastiques' && subjectMap['arts-plastiques']) {
    target = subjectMap['arts-plastiques'];
  }
  // gestion
  else if (/\bgestion\s+comptable|\bcomptabilit[ée]\b/.test(t) && currentSlug !== 'gestion' && subjectMap['gestion']) {
    target = subjectMap['gestion'];
  }
  // Education artistique (different from arts-plastiques)
  else if (/\b[ée]ducation\s*artistique\b/.test(t) && currentSlug !== 'education-artistique' && subjectMap['education-artistique']) {
    target = subjectMap['education-artistique'];
  }
  // Sport subject
  else if (/\b[ée]ducation\s*physique\b/.test(t) && currentSlug !== 'sport' && subjectMap['sport']) {
    target = subjectMap['sport'];
  }

  if (target) {
    batch.push(p.resource.update({
      where: { id: r.id },
      data: { subjectId: target }
    }));
    fixed++;
  }

  if (batch.length >= 50) {
    await Promise.all(batch);
    batch = [];
  }
}

if (batch.length > 0) {
  await Promise.all(batch);
}

console.log(`Fixed: ${fixed}`);
await p.$disconnect();

#!/usr/bin/env node
/**
 * Reclassify 16 files that were 'arabe' but actually French content (2026-08-19)
 *
 * User feedback 2026-08-19: 'verifie s'il y a des fichier en langue fr
 * ici [arabe lycée]' + 'non on doit vérifier si le contenu est fr donc
 * c'est un fichier etude de texte françias donc matière = Français'
 *
 * These 16 files were originally labeled 'arabe' with language='fr'.
 * The user clarified: if the actual content is French, they should be
 * reclassified to subject='Français' (Étude de texte).
 *
 * Verified by inspecting ResourceContent.fullText — all 16 contain
 * French text (French sentences, French literary texts). 2 other
 * files (#4616, #4617) had only a title page (Tunisian name) with
 * no detectable language, kept as 'arabe' / language='ar'.
 *
 * For each of the 16:
 * - subject: arabe → francais
 * - language: fr (kept)
 * - title: regenerated in French format
 *   (Devoir de Contrôle N°X - Français - ClassAS - Section)
 * - slug: regenerated
 *
 * IDs reclassified: 3987, 8259, 4589, 13988, 13960, 9338, 7957, 4592,
 *                   7952, 14007, 7955, 7940, 7918, 15365, 7886, 15364
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
async function main() {
  const fr = await p.subject.findFirst({ where: { slug: 'francais' } });
  const FRENCH_FILES = [3987, 8259, 4589, 13988, 13960, 9338, 7957, 4592, 7952, 14007, 7955, 7940, 7918, 15365, 7886, 15364];
  for (const id of FRENCH_FILES) {
    const r = await p.resource.findFirst({ where: { numericId: id }, include: { class: true, section: true, metadata: true } });
    if (!r) continue;
    let typeStr = 'Document';
    if (r.type === 'HOMEWORK' && r.homeworkNumber) {
      const subtype = r.metadata?.subtype || r.headerData?.homeworkSubtype;
      if (subtype === 'synthèse' || subtype === 'SYNTHESIS') typeStr = 'Devoir de Synthèse';
      else if (subtype === 'contrôle' || subtype === 'CONTROL') typeStr = 'Devoir de Contrôle';
      else typeStr = 'Devoir';
      typeStr = typeStr + ' N°' + r.homeworkNumber;
    } else if (r.type === 'EXERCISE') typeStr = "Série d'exercices";
    else if (r.type === 'COURSE') typeStr = 'Cours';
    else if (r.type === 'EXAM') typeStr = 'Examen';
    else if (r.type === 'SUMMARY') typeStr = 'Résumé';
    const classLabel = r.class.slug === '1ere-secondaire' ? '1AS' : r.class.slug === '2eme-secondaire' ? '2AS' : r.class.slug === '3eme-secondaire' ? '3AS' : '4AS';
    const sectionLabel = r.section ? (r.section.slug === 'sciences' ? 'Sciences' : r.section.slug === 'lettres' ? 'Lettres' : r.section.slug === 'sciences-experimentales' ? 'Sciences Expérimentales' : r.section.slug === 'maths' ? 'Mathématiques' : r.section.nameFr) : '';
    let newTitle = typeStr + ' - Français - ' + classLabel;
    if (sectionLabel) newTitle += ' - ' + sectionLabel;
    if (r.year) newTitle += ' (' + r.year + ')';
    if (r.metadata?.generalSubject) newTitle += ' : ' + r.metadata.generalSubject;
    const newSlug = properSlugify(newTitle, 80) + '-' + id;
    await p.resource.update({
      where: { id: r.id },
      data: { title: newTitle, slug: newSlug, subjectId: fr.id, language: 'fr' }
    });
    console.log('  ✅ #' + id);
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error(e); p.$disconnect(); process.exit(1); });

// 2026-08-19 update: #14023 philo → français (étude de texte)
// Content is in French (Laurent Chaloupe, robots, libre arbitre)
// 4AS lettres, DC n°3, kept all other fields

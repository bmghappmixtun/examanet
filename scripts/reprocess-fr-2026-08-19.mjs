#!/usr/bin/env node
/**
 * Re-process AI attributes in French for 16 'français' files (2026-08-19)
 *
 * User feedback 2026-08-19: 'il faut bien corriger les titres du ar
 * vers fr, format examanet et avec des attribut ia de la meme langue.
 * Et les titres fr doivent 100% fr et ar doivent 100% ar.'
 *
 * These 16 files were originally subject='arabe' with all AI
 * attributes in Arabic. After reclassifying to subject='français',
 * the AI attributes need to be regenerated in French to match the
 * content language and the subject.
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FRENCH_FILES = [3987, 8259, 4589, 13988, 13960, 9338, 7957, 4592, 7952, 14007, 7955, 7940, 7918, 15365, 7886, 15364];

const SYSTEM_PROMPT = `Tu es un expert en littérature française. Tu analyses des textes littéraires français (extraits, poèmes, fables, nouvelles) pour des étudiants tunisiens de lycée.

Pour CHAQUE texte, retourne un objet JSON avec EXACTEMENT ces champs:
- "generalSubject": 4-8 mots en FRANÇAIS qui résument le sujet (ex: "La Fontaine - Fable - Ambition et prudence", "Hugo - Poésie - Misère sociale", "Maupassant - Nouvelle - Condition féminine"). PAS d'arabe.
- "topics": tableau de 7-9 mots-clés en FRANÇAIS, 1-2 mots chacun (ex: ["fable", "ambition", "prudence", "moralité", "voyage"])
- "shortKeyPoints": tableau de 3-5 idées essentielles, 2-5 mots chacune en FRANÇAIS (ex: ["L'ambition démesurée", "La chute morale"])
- "keyPoints": tableau de 2-4 analyses approfondies en FRANÇAIS, une phrase chacune
- "difficulty": "facile" | "moyen" | "difficile"

IMPORTANT: Tout en FRANÇAIS. Réponds UNIQUEMENT avec le JSON.`;

const arabicMap = { 'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h' };
const properSlugify = (text, maxLen) => {
  let s = text.replace(/[\u0600-\u06FF]/g, c => arabicMap[c] || '');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  s = s.replace(/^-+|-+$/g, '');
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/, '');
  return s;
};

async function processOne(id, retries = 3) {
  const r = await p.resource.findFirst({ 
    where: { numericId: id },
    include: { metadata: true }
  });
  if (!r) { console.log('#' + id + ': not found'); return false; }
  const c = await p.resourceContent.findFirst({ where: { resourceId: r.id } });
  if (!c || !c.fullText) { console.log('#' + id + ': no fullText'); return false; }
  
  const fullText = c.fullText.substring(0, 6000);
  
  let result;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const completion = await oai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analyse ce texte littéraire français et retourne le JSON:\n\n${fullText}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });
      result = JSON.parse(completion.choices[0].message.content);
      break;
    } catch (e) {
      console.log(`  attempt ${attempt}/${retries} failed for #${id}: ${e.message.substring(0, 100)}`);
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  
  if (!result) return false;
  
  // Update metadata
  const updateData = {
    modelUsed: 'gpt-4o-mini-v1-fr-resync',
  };
  if (result.generalSubject) updateData.generalSubject = result.generalSubject;
  if (result.topics) updateData.topics = result.topics;
  if (result.shortKeyPoints) updateData.shortKeyPoints = result.shortKeyPoints;
  if (result.keyPoints) updateData.keyPoints = result.keyPoints;
  if (result.difficulty) updateData.difficulty = result.difficulty;
  
  await p.resourceMetadata.update({
    where: { resourceId: r.id },
    data: updateData
  });
  
  // Update title: replace AR topic with FR generalSubject
  const titleMatch = r.title.match(/^(.+?)\s*:\s*(.+)$/);
  if (titleMatch && result.generalSubject) {
    const newTitle = titleMatch[1] + ' : ' + result.generalSubject;
    const newSlug = properSlugify(newTitle, 80) + '-' + id;
    await p.resource.update({
      where: { id: r.id },
      data: { title: newTitle, slug: newSlug }
    });
  }
  
  console.log('✅ #' + id + ': ' + (result.generalSubject || 'N/A'));
  return true;
}

async function main() {
  let ok = 0, fail = 0;
  for (const id of FRENCH_FILES) {
    try {
      if (await processOne(id)) ok++; else fail++;
    } catch (e) {
      console.error('❌ #' + id + ':', e.message);
      fail++;
    }
  }
  console.log(`\n📊 Done: ${ok} ok, ${fail} failed`);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });

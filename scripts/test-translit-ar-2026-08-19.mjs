#!/usr/bin/env node
/**
 * Test: transliterate FR teacher names to AR (2026-08-19)
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transliterate(firstName, lastName, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const completion = await oai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'Tu es un expert des noms arabes et de leur translittération. Tu reçois un prénom et un nom de famille en français (translittération d\'un nom arabe/tunisien), et tu dois retourner la version arabe authentique. Par exemple: "Mohsen Chaieb" → {"firstNameAr": "محسن", "lastNameAr": "الشايب"}. Retourne UNIQUEMENT le JSON avec les champs firstNameAr et lastNameAr. Si le nom ne semble pas être d\'origine arabe, retourne les noms en arabe phonétique: "Pierre Dupont" → {"firstNameAr": "بيير", "lastNameAr": "دوبون"}.'
          },
          { 
            role: 'user', 
            content: `Prénom: ${firstName}\nNom de famille: ${lastName || '(none)'}\n\nRetourne le JSON:` 
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

async function main() {
  const teachers = await p.user.findMany({
    where: {
      role: 'TEACHER',
      firstName: { not: null },
      OR: [
        { firstNameAr: null },
        { lastNameAr: null }
      ]
    },
    take: 10,
    orderBy: { numericId: 'asc' },
  });
  
  console.log(`Testing on ${teachers.length} teachers:\n`);
  for (const t of teachers) {
    try {
      const result = await transliterate(t.firstName, t.lastName);
      console.log(`#${t.numericId.toString().padStart(5)} | ${t.firstName.padEnd(20)} ${(t.lastName || '').padEnd(20)} | AR: ${result.firstNameAr} ${result.lastNameAr || ''}`);
    } catch (e) {
      console.log(`#${t.numericId.toString().padStart(5)} | ${t.firstName.padEnd(20)} ${(t.lastName || '').padEnd(20)} | ERROR: ${e.message.substring(0, 80)}`);
    }
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });

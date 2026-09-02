#!/usr/bin/env node
/**
 * Test: transliterate FR teacher names to AR via Google Gemini (2026-08-19)
 */
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function transliterate(firstName, lastName, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        }
      });
      const prompt = `Tu es un expert des noms arabes. Tu reçois un prénom et un nom de famille en français (translittération d'un nom arabe/tunisien), et tu dois retourner la version arabe authentique. Par exemple: "Mohsen Chaieb" → {"firstNameAr": "محسن", "lastNameAr": "الشايب"}. Retourne UNIQUEMENT le JSON avec les champs firstNameAr et lastNameAr. Si le nom ne semble pas être d'origine arabe, retourne les noms en arabe phonétique: "Pierre Dupont" → {"firstNameAr": "بيير", "lastNameAr": "دوبون"}.

Prénom: ${firstName}
Nom de famille: ${lastName || '(none)'}

Retourne le JSON:`;
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
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
    skip: 10,
    orderBy: { numericId: 'asc' },
  });
  
  console.log(`Gemini 2.5 Flash — Testing on ${teachers.length} teachers:\n`);
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

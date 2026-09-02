#!/usr/bin/env node
/**
 * Compare OpenAI vs Gemini on the same 10 professors (2026-08-19)
 *
 * User feedback 2026-08-19: 'on un un test de 10 profs sur les
 * 2 ia agents (meme profs)'
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const p = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `Tu es un expert des noms arabes et de leur translittération. Tu reçois un prénom et un nom de famille en français (translittération d'un nom arabe/tunisien), et tu dois retourner la version arabe authentique. Par exemple: "Mohsen Chaieb" → {"firstNameAr": "محسن", "lastNameAr": "الشايب"}. Retourne UNIQUEMENT le JSON avec les champs firstNameAr et lastNameAr. Si le nom ne semble pas être d'origine arabe, retourne les noms en arabe phonétique: "Pierre Dupont" → {"firstNameAr": "بيير", "lastNameAr": "دوبون"}.`;

async function transliterateOpenAI(firstName, lastName, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const completion = await oai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Prénom: ${firstName}\nNom de famille: ${lastName || '(none)'}\n\nRetourne le JSON:` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

async function transliterateGemini(firstName, lastName, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      });
      const prompt = SYSTEM_PROMPT + `\n\nPrénom: ${firstName}\nNom de famille: ${lastName || '(none)'}\n\nRetourne le JSON:`;
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

async function main() {
  // 10 same teachers
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
  
  console.log(`Comparing OpenAI vs Gemini on ${teachers.length} teachers:\n`);
  console.log('| #    | FR                    | OpenAI              | Gemini              | Match |');
  console.log('|------|----------------------|---------------------|---------------------|-------|');
  let matches = 0, openaiErrs = 0, geminiErrs = 0;
  for (const t of teachers) {
    const fr = `${t.firstName} ${t.lastName || ''}`.padEnd(20);
    let oaiResult = '', gemResult = '', match = '';
    try {
      const r1 = await transliterateOpenAI(t.firstName, t.lastName);
      oaiResult = `${r1.firstNameAr} ${r1.lastNameAr || ''}`.trim();
    } catch (e) {
      oaiResult = 'ERROR: ' + e.message.substring(0, 30);
      openaiErrs++;
    }
    try {
      const r2 = await transliterateGemini(t.firstName, t.lastName);
      gemResult = `${r2.firstNameAr} ${r2.lastNameAr || ''}`.trim();
    } catch (e) {
      gemResult = 'ERROR: ' + e.message.substring(0, 30);
      geminiErrs++;
    }
    if (oaiResult === gemResult && !oaiResult.startsWith('ERROR')) {
      match = '✓';
      matches++;
    }
    console.log(`| ${t.numericId.toString().padStart(4)} | ${fr} | ${oaiResult.padEnd(20)} | ${gemResult.padEnd(20)} | ${match} |`);
  }
  console.log('\n' + '='.repeat(80));
  console.log(`📊 Stats: ${matches}/${teachers.length} exact matches, ${openaiErrs} OpenAI errors, ${geminiErrs} Gemini errors`);
}
main().then(() => p.$disconnect()).catch(e => { console.error('💥', e); p.$disconnect(); process.exit(1); });

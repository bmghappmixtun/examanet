#!/usr/bin/env node
/**
 * Backfill courseSubject for all Technologie COURS files.
 * 
 * 1. Extract subject from title via regex (extractCourseSubject)
 * 2. If not found and content has a clear subject, try AI extraction
 * 3. If still not found, fallback to generalSubject
 * 4. Save to metadata.courseSubject
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Import the function (we'll inline it for now to avoid tsx dependency)
const TITLE_NOISE = [
  /^n°?\s*\d+\s*(er|eme|ème)?\s*$/i,
  /^(devoir|exercice|série|cours|contrôle|synth[èe]se)\s+(de\s+|n°?\s*\d+)/i,
  /^(technologie|techno|g[ée]nie)/i,
  /^(trim(estre)?)\s*\d+/i,
  /^(1ère?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(2ème?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(3ème?\s*ann[ée]e?\s+secondaire?\s*)/i,
  /^(4ème?\s*ann[ée]e?\s+secondaire?\s*(bac)?\s*)/i,
  /^(as|2018-2019|2019-2020|2020-2021|2021-2022|2022-2023|2023-2024|2024-2025|2025-2026)$/i,
  /^-?\s*$/,
];

function cleanName(name) {
  return (name || '').replace(/\s+/g, ' ').trim();
}

function isValidName(name) {
  if (!name || name.length < 4 || name.length > 100) return false;
  for (const noise of TITLE_NOISE) {
    if (noise.test(name)) return false;
  }
  if (!/[a-zA-Zà-ÿÀ-Ÿ]{4,}/.test(name)) return false;
  return true;
}

function extractCourseSubject(title) {
  if (!title) return null;

  // Pattern 1: "Cours - Technologie: SUJET - CLASS"
  const p1 = title.match(/Cours\s*-\s*Technologie\s*[:]\s+([^-:]+?)(?:\s*[-:]\s*(?:\d|1ère|2ème|3ème|4ème|1AS|2AS|3AS|4AS|Technique|Technologies|Sciences|Section|Profil|génie|\(|$)|\s*$)/i);
  if (p1) {
    const subj = cleanName(p1[1]);
    if (isValidName(subj)) return subj;
  }

  // Pattern 2: "Cours - Technologie: SUJET"
  const p2 = title.match(/Cours\s*[-:]\s*Technologie\s*[:]\s+(.+?)(?:\s*$|\s*\()/i);
  if (p2) {
    const subj = cleanName(p2[1]);
    if (isValidName(subj) && subj.length < 100) return subj;
  }

  // Pattern 3: "Cours - Génie X SUJET"
  const p3 = title.match(/Cours\s*-\s*Génie\s+(?:[Mm]écanique|[Éé]lectrique)\s+(.+?)(?:\s*-\s*(?:\d|1ère|2ème|3ème|4ème|1AS|2AS|3AS|4AS|Technique|Technologies|Sciences|Section|Profil|\(|$)|\s*$)/i);
  if (p3) {
    const subj = cleanName(p3[1]);
    if (isValidName(subj) && subj.length < 100) return subj;
  }

  // Pattern 4: "Cours - Technologie: SUJET Leçon N"
  const p4 = title.match(/Cours\s*[-:]\s*Technologie\s*[:]\s+(.+?)(?:\s*,?\s*(?:Leçon|Chapitre)\s|\s*$)/i);
  if (p4) {
    const subj = cleanName(p4[1]);
    if (isValidName(subj) && subj.length < 100) return subj;
  }

  return null;
}

// AI extraction for files where regex fails
async function aiExtractCourseSubject(title, text) {
  if (!text || text.length < 200) return null;
  try {
    const excerpt = text.slice(0, 3000);
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Tu réponds uniquement avec le sujet principal du cours en français (2-8 mots). Pas de phrase, pas de ponctuation finale.' },
        { role: 'user', content: `Identifie le SUJET PRINCIPAL de ce cours de Technologie tunisien (1ère-4ème année secondaire).

Exemples de réponses valides:
- "Analyse fonctionnelle"
- "Logique combinatoire"
- "Modélisation d'un système technique"
- "Cotation fonctionnelle"
- "Transmission de mouvement"
- "GRAFCET"
- "Moteurs électriques"

Si pas identifiable clairement, retourne: "Sujet non identifié"

TITRE: ${title}

EXTRAIT:
${excerpt.slice(0, 2000)}` },
      ],
      temperature: 0.1,
      max_tokens: 50,
    });
    const name = resp.choices[0].message.content.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
    if (name && name.length < 100 && !name.toLowerCase().includes('sujet non') && !name.toLowerCase().includes('non ident')) {
      return cleanName(name);
    }
  } catch (e) {
    console.error('AI error:', e.message);
  }
  return null;
}

async function main() {
  const all = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.type,
           m."generalSubject", m."systemName",
           LENGTH(rc."fullText") as text_len
    FROM "Resource" r
    JOIN "Subject" sub ON sub.id = r."subjectId"
    LEFT JOIN "ResourceMetadata" m ON m."resourceId" = r.id
    LEFT JOIN "ResourceContent" rc ON rc."resourceId" = r.id
    WHERE sub.slug = 'technologie'
      AND r.type = 'COURSE'
      AND r.status = 'PUBLISHED'
    ORDER BY r."numericId"
  `;
  console.log('Total COURS Technologie:', all.length);

  const STATE = { extracted_title: 0, extracted_ai: 0, fallback_generalSubject: 0, failed: 0 };
  const failed = [];

  for (const r of all) {
    let subject = extractCourseSubject(r.title);
    let method = 'title';

    if (!subject) {
      // Try AI from content
      const content = await p.resourceContent.findUnique({ where: { resourceId: r.id } });
      if (content?.fullText && content.fullText.length > 200) {
        subject = await aiExtractCourseSubject(r.title, content.fullText);
        method = 'ai';
      }
    }

    if (!subject && r.generalSubject) {
      subject = cleanName(r.generalSubject);
      if (subject.length > 80) subject = subject.slice(0, 77) + '...';
      method = 'generalSubject';
    }

    if (subject) {
      await p.resourceMetadata.upsert({
        where: { resourceId: r.id },
        create: {
          resourceId: r.id,
          courseSubject: subject,
        },
        update: {
          courseSubject: subject,
        },
      });
      STATE[`extracted_${method}`] = (STATE[`extracted_${method}`] || 0) + 1;
      console.log(`  ✓ #${r.numericId} (${method}): ${subject}`);
    } else {
      STATE.failed++;
      failed.push({ id: r.numericId, title: r.title });
      console.log(`  ✗ #${r.numericId}: FAILED - ${r.title.slice(0, 60)}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(STATE, null, 2));
  if (failed.length > 0) {
    console.log(`\n${failed.length} FAILED files:`);
    failed.forEach(f => console.log(`  #${f.id}: ${f.title}`));
  }

  await p.$disconnect();
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * Backfill generalSubject for Technologie lycée files.
 * 
 * Strategy:
 * 1. Files where metadata.subject is a REAL value (not matter name): copy to generalSubject
 * 2. Files where subject is NULL: use systemName as fallback
 * 3. Files where neither exists: AI extract from content
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Matter names that are useless (just the subject/matter name, not a real topic)
const MATTER_NAMES = new Set([
  'Technologie', 'technologie', 'TECHNOLOGIE',
  'Mathématiques', 'mathématiques', 'MATHÉMATIQUES',
  'Physique', 'physique', 'PHYSIQUE',
  'Sciences', 'sciences', 'SCIENCES',
  'Sciences Techniques', 'Sciences techniques', 'sciences techniques',
  'Sciences de la Vie et de la Terre', 'Sciences de la vie et de la terre',
  'Génie Mécanique', 'Génie mécanique', 'génie mécanique', 'génie Mécanique',
  'Génie Électrique', 'Génie électrique', 'génie électrique', 'génie Électrique',
  'TECHNIQUE', 'technique', 'Technique',
  'TECHNOLOGIE', 'LA TECHNOLOGIE', 'LA TECHNOLOGIE',
  'TECHNOLOGIE', 'Technologie des systèmes techniques',
  'Disciplines techniques', 'Sciences Techniques',
  'Sc. TECHNIQUES', 'SCIENCES TECHNIQUES',
  'MATHÉMATIQUES', 'MATHEMATIQUES', 'mathematiques',
  'Physique', 'PHYSIQUE', 'physique',
  'Discipline technique', 'DISCIPLINE TECHNIQUE',
  // Generic
  'Système technique', 'système technique',
]);

function isMatterName(s) {
  if (!s) return true;
  return MATTER_NAMES.has(s.trim());
}

function normalizeSubject(s) {
  if (!s) return null;
  let cleaned = s.trim()
    .replace(/\s+/g, ' ')
    // Title Case
    .toLowerCase()
    .replace(/(^|\s)\w/g, c => c.toUpperCase());
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 77) + '...';
  return cleaned;
}

async function aiExtractGeneralSubject(title, text, systemName) {
  if (!text || text.length < 200) return null;
  try {
    const excerpt = text.slice(0, 4000);
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Tu réponds uniquement avec le SUJET GÉNÉRAL du cours/devoir en français (2-6 mots). Pas de phrase, pas de ponctuation finale, pas de préposition au début. Juste le titre du sujet.' },
        { role: 'user', content: `Identifie le SUJET GÉNÉRAL (le thème de la leçon) de ce document de Technologie tunisien.

ATTENTION: le sujet est DIFFÉRENT du système étudié.
- Système étudié = l'objet physique (ex: "Pompe de gonflage", "Vé réglable")
- Sujet général = le thème de la leçon (ex: "Analyse fonctionnelle", "Cotation fonctionnelle", "Logique combinatoire", "GRAFCET", "Dessin technique", "Transmission de mouvement")

Exemples de réponses valides:
- "Analyse fonctionnelle"
- "Cotation fonctionnelle"
- "Logique combinatoire"
- "GRAFCET"
- "Modélisation d'un système technique"
- "Dessin d'ensemble"
- "Transmission de mouvement"
- "Moteurs électriques"
- "Cric hydraulique"
- "Pompe de gonflage" (si le sujet principal EST la pompe)
- "Système de numération" (si c'est de l'informatique)

Si pas identifiable, retourne: "Sujet non identifié"

TITRE: ${title}
SYSTÈME ÉTUDIÉ (si connu): ${systemName || 'non spécifié'}

EXTRAIT:
${excerpt.slice(0, 2500)}` },
      ],
      temperature: 0.1,
      max_tokens: 50,
    });
    const name = resp.choices[0].message.content.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
    if (name && name.length < 100 && !name.toLowerCase().includes('sujet non') && !name.toLowerCase().includes('non ident') && name.length > 3) {
      return normalizeSubject(name);
    }
  } catch (e) {
    console.error('AI error:', e.message);
  }
  return null;
}

async function main() {
  // Get all Technologie lycée files
  const all = await p.$queryRaw`
    SELECT r.id, r."numericId", r.title, r.type,
           m."subject" as meta_subject,
           m."generalSubject",
           m."systemName"
    FROM "Resource" r
    JOIN "Subject" sub ON sub.id = r."subjectId"
    JOIN "Class" c ON c.id = r."classId"
    LEFT JOIN "ResourceMetadata" m ON m."resourceId" = r.id
    WHERE sub.slug = 'technologie'
      AND c.slug IN ('1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire')
      AND r.status = 'PUBLISHED'
    ORDER BY r."numericId"
  `;
  console.log('Total Technologie lycée:', all.length);

  const STATS = { from_subject: 0, from_systemname: 0, from_ai: 0, skipped: 0, failed: 0 };
  const skipped = [];

  for (const r of all) {
    // Skip if already has generalSubject
    if (r.generalSubject && r.generalSubject.length > 2) {
      STATS.skipped++;
      continue;
    }

    let generalSubject = null;
    let method = null;

    // Step 1: Use meta.subject if it's a real value
    if (r.meta_subject && !isMatterName(r.meta_subject)) {
      generalSubject = normalizeSubject(r.meta_subject);
      method = 'subject';
    }
    // Step 2: Fallback to systemName
    else if (r.systemName) {
      generalSubject = normalizeSubject(r.systemName);
      method = 'systemName';
    }
    // Step 3: AI extract from content
    else {
      const content = await p.resourceContent.findUnique({ where: { resourceId: r.id } });
      if (content?.fullText && content.fullText.length > 200) {
        generalSubject = await aiExtractGeneralSubject(r.title, content.fullText, r.systemName);
        method = 'ai';
      }
    }

    if (generalSubject) {
      await p.resourceMetadata.upsert({
        where: { resourceId: r.id },
        create: {
          resourceId: r.id,
          generalSubject: generalSubject,
        },
        update: {
          generalSubject: generalSubject,
        },
      });
      STATS[`from_${method}`] = (STATS[`from_${method}`] || 0) + 1;
      console.log(`  ✓ #${r.numericId} (${method}): ${generalSubject}`);
    } else {
      STATS.failed++;
      skipped.push({ id: r.numericId, title: r.title, meta_subject: r.meta_subject, systemName: r.systemName });
      console.log(`  ✗ #${r.numericId}: FAILED`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(STATS, null, 2));
  if (skipped.length > 0) {
    console.log(`\n${skipped.length} FAILED files (sample 10):`);
    skipped.slice(0, 10).forEach(s => {
      console.log(`  #${s.id}: meta_subject=${s.meta_subject || 'NULL'} systemName=${s.systemName || 'NULL'}`);
      console.log(`    ${s.title.slice(0, 70)}`);
    });
  }

  await p.$disconnect();
}

main().catch(console.error);

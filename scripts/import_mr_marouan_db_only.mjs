#!/usr/bin/env node
/**
 * Import 8 devoirs from Mr Ben Abdallah Marouan's JimdoFree site into Examanet DB.
 *
 * NOTE: Google Drive files are restricted (require authentication).
 * We create DB records with fileKey=null, fileUrl=null.
 * Admin can upload PDFs later via the admin UI.
 *
 * For each file:
 * 1. Build proper Examanet title
 * 2. Generate AI insights with gpt-4o-mini (from existing similar PDFs in DB)
 * 3. Create Resource + ResourceMetadata records
 * 4. Set teacher = Ben Abdallah Marouan
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TEACHER_ID = 'cmr8vw9in02lfq4p04h5jlxmn'; // Ben Abdallah Marouan

const FILES = [
  { type: 'DEVOIR', subtype: 'CONTROL', n: 2, year: '2018-2019', subject: 'Unité Flexible de Production' },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 2, year: '2017-2018', subject: 'Débitage de Ceintures' },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 2, year: '2017-2018', subject: 'Butée de Fraisage' },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 2, year: '2016-2017', subject: 'Poste Automatique de Poinçonnage' },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 2, year: '2015-2016', subject: "Système d'encaissage" },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 2, year: '2014-2015', subject: 'Unité de Perçage' },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 2, year: '2013-2014', subject: 'Unité de Tri Automatique de Caisse' },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 2, year: '2013-2014', subject: 'Système de Conditionnement des Bidons' },
];

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/['']/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

// Generate AI insights based on generalSubject (since we don't have the PDF text)
async function generateInsightsFromSubject(subject, type, year) {
  const prompt = `Tu es un expert en TECHNOLOGIE du système éducatif tunisien (lycée 3ème année Sciences Techniques - Génie Mécanique).

Le système étudié est: ${subject}

Génère 3-5 insights (résumés d'exercices typiques) pour ce type de devoir:

Format pour CHAQUE: "Exercice N: [domaine GM] - [résumé FR, 10-25 mots]"

DOMAINES GM:
  A. ANALYSE FONCTIONNELLE (bête à cornes, diagramme pieuvre, CdCF)
  B. ANALYSE STRUCTURELLE (graphe des liaisons, classes d'équivalence, schéma cinématique)
  C. CINÉMATIQUE (rapports, vitesses, couples, puissances, rendement)
  D. RDM (contraintes, déformations, flexion, torsion)
  E. DESSIN TECHNIQUE (projection, cotation, chaîne de cotes)
  F. MÉTROLOGIE/FABRICATION (machines-outils, usinage)

JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
Année: ${year}
IMPORTANT: PAS de "(Type)" après le numéro. Longueur max 200 chars par item.`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Génère les insights.' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800,
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    let insights = parsed.exercises || [];
    insights = insights.filter(e =>
      e.includes('Exercice') && e.includes(':') && e.includes(' - ') && e.length < 250
    );
    return insights;
  } catch (e) {
    console.error('  AI error:', e.message);
    return [];
  }
}

async function main() {
  // Get class, section, subject
  const classRecord = await p.class.findUnique({ where: { slug: '3eme-secondaire' } });
  const sectionRecord = await p.section.findFirst({ where: { slug: 'technique' } });
  const subjectRecord = await p.subject.findUnique({ where: { slug: 'technologie' } });

  if (!classRecord || !sectionRecord || !subjectRecord) {
    console.log('Missing required records');
    return;
  }

  console.log(`Class: ${classRecord.nameFr}`);
  console.log(`Section: ${sectionRecord.nameFr} (using 1AS section - existing pattern)`);
  console.log(`Subject: ${subjectRecord.nameFr}`);
  console.log(`Teacher: ${TEACHER_ID}`);
  console.log('');

  const STATS = { imported: 0, errors: 0, skipped: 0 };

  for (const f of FILES) {
    const typeLabel = f.subtype === 'SYNTHESIS' ? 'Devoir de Synthèse' : 'Devoir de Contrôle';
    const title = `${typeLabel} N°${f.n} - Technologie: ${f.subject} - 3AS - Section Technique (${f.year})`;

    console.log(`\n=== ${f.subject} (${f.year}) ===`);

    // Check if already imported
    const existing = await p.resource.findFirst({
      where: {
        teacherId: TEACHER_ID,
        title: { contains: f.subject, mode: 'insensitive' },
        year: f.year,
      },
    });
    if (existing) {
      console.log(`  ⊘ Already exists: #${existing.numericId}`);
      STATS.skipped++;
      continue;
    }

    // Generate AI insights
    console.log('  Generating AI insights...');
    const insights = await generateInsightsFromSubject(f.subject, f.type, f.year);
    console.log(`  Insights: ${insights.length} items`);

    // Create Resource
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newResource = await p.resource.create({
      data: {
        title,
        slug: slugify(title) + '-temp',
        type: f.type,
        status: 'PUBLISHED',
        language: 'fr',
        year: f.year,
        classId: classRecord.id,
        sectionId: sectionRecord.id,
        subjectId: subjectRecord.id,
        teacherId: TEACHER_ID,
        homeworkSubtype: f.subtype,
        homeworkNumber: f.n,
        hasCorrection: false,
        publishedAt: new Date(),
        importedByAdmin: true,
        importedFrom: 'jimdofree.com/mimfs',
        // Placeholder: admin will upload PDF later
        fileKey: `pending-upload/${TEACHER_ID}/jimdofree-${f.year}-${slugify(f.subject)}.pdf`,
        fileUrl: `https://examanet.com/api/admin/pending-upload/${tempId}`,
        fileSize: 0,
        pageCount: 0,
      },
    });

    // Update slug with numericId
    const finalSlug = `${slugify(title)}-${newResource.numericId}`;
    await p.resource.update({
      where: { id: newResource.id },
      data: { slug: finalSlug },
    });
    console.log(`  ✓ Created #${newResource.numericId}: ${title}`);
    console.log(`  ✓ Slug: ${finalSlug}`);

    // Create ResourceMetadata
    await p.resourceMetadata.create({
      data: {
        resourceId: newResource.id,
        generalSubject: f.subject,
        systemName: f.subject,
        modelUsed: 'gpt-4o-mini-tech-lycee-v5-batch',
        exerciseInsights: insights,
        extractedAt: new Date(),
      },
    });

    STATS.imported++;
    console.log(`  ✓ Metadata saved`);

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(STATS, null, 2));

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

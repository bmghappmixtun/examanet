#!/usr/bin/env node
/**
 * Import 11 NEW 3-Sc-T (DC1/DS1) PDFs for Mr Marouan + update 2 duplicates.
 * Files are already uploaded to Vercel Blob.
 * 
 * Updates #7663 (Fraiseuse 14-15) and #7664 (Peinture Paraboles 13-14) with file info.
 * Creates 11 new records for DC1/DS1 years 2011-2019.
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { config } from 'dotenv';

config({ path: '/workspace/edutunisie/.env.local' });
const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TEACHER_ID = 'cmr8vw9in02lfq4p04h5jlxmn'; // Ben Abdallah Marouan

// Updates for 2 duplicates - just file info
const UPDATES = [
  {
    numericId: 7663,  // DC1 3ScT Fraiseuse Automatique 14-15
    fileKey: 'NEW_1r2mUBjeh5qXWPWK2rpgbbsceS-2-oaQt-9lHlDBhLBCeq57Szt3Vn3f3Iz3LHC0.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/NEW_1r2mUBjeh5qXWPWK2rpgbbsceS-2-oaQt-9lHlDBhLBCeq57Szt3Vn3f3Iz3LHC0.pdf',
    fileSize: 2511538,
    pageCount: 13,
  },
  {
    numericId: 7664,  // DS1 3ScT Poste Automatique De Peinture De Paraboles 13-14
    fileKey: 'OLD_0B1_7vhMyWH47RTFKaV9WUmdBS2c-emyibNOM1aXoA6bFHzFJ7I4Ms2gRoF.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/OLD_0B1_7vhMyWH47RTFKaV9WUmdBS2c-emyibNOM1aXoA6bFHzFJ7I4Ms2gRoF.pdf',
    fileSize: 3824010,
    pageCount: 15,
  },
];

// 11 NEW files to create (Examanet title format)
const NEW_FILES = [
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2018-2019', subject: 'Cale Réglable Inclinée',
    fileKey: 'NEW_1JxAmq73TFK3JiBMq7pmeR8b87BUmHUxS-D9Cf5cGu2a2IcdPn0TAX28su3DFRBm.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/NEW_1JxAmq73TFK3JiBMq7pmeR8b87BUmHUxS-D9Cf5cGu2a2IcdPn0TAX28su3DFRBm.pdf',
    fileSize: 2618474, pageCount: 12,
  },
  { 
    type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2018-2019', subject: 'Poste de Mortaisage Automatique',
    fileKey: 'NEW_11FlCSF465ltQUmIZ36QDzWNi9dFiLVpc-BcEtNcmaujPT0UDDmAMrtGdbD6nSRf.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/NEW_11FlCSF465ltQUmIZ36QDzWNi9dFiLVpc-BcEtNcmaujPT0UDDmAMrtGdbD6nSRf.pdf',
    fileSize: 3662919, pageCount: 15,
  },
  { 
    type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2017-2018', subject: 'Butée Réglable Inclinée',
    fileKey: 'NEW_1gRyHBaLx_LhKns04_IwtK0np4HGYu5-v-HvBD4wIt16MGJLSedqFcIfuEELEFR3.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/NEW_1gRyHBaLx_LhKns04_IwtK0np4HGYu5-v-HvBD4wIt16MGJLSedqFcIfuEELEFR3.pdf',
    fileSize: 1660467, pageCount: 6,
  },
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2017-2018', subject: 'Poste de Tronçonnage des Barres',
    fileKey: 'NEW_1E6G3kxaMyr1kvcNY76fZkh0jKD8Yk4Of-RJTAu7e6ZHQoMUKIu606cvWBcz3qny.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/NEW_1E6G3kxaMyr1kvcNY76fZkh0jKD8Yk4Of-RJTAu7e6ZHQoMUKIu606cvWBcz3qny.pdf',
    fileSize: 2526336, pageCount: 14,
  },
  { 
    type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2016-2017', subject: 'Crampon Plaqueur Norelem',
    fileKey: 'NEW_1pBQ-b7YpvEfYarxSEjdMJlT28_BUEktv-p4oMlgJOEthXUEGyL7ZgWgUrJhKPea.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/NEW_1pBQ-b7YpvEfYarxSEjdMJlT28_BUEktv-p4oMlgJOEthXUEGyL7ZgWgUrJhKPea.pdf',
    fileSize: 2089089, pageCount: 7,
  },
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2016-2017', subject: 'Unité Flexible de Production',
    fileKey: 'NEW_1GvyRC29zYfgz28J91DzaQc2mjOlqFb7v-RCkMgaSa6FeccAYqkWrRuua3nPK2gk.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/NEW_1GvyRC29zYfgz28J91DzaQc2mjOlqFb7v-RCkMgaSa6FeccAYqkWrRuua3nPK2gk.pdf',
    fileSize: 2010084, pageCount: 7,
  },
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2015-2016', subject: "Unité Flexible d'Usinage",
    fileKey: 'NEW_1PwRFGnBZvQIMtEtjxYBVjFOnMWghef00-3LfKupR6zmnk4hLoGIEehyxX6y9oeL.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/NEW_1PwRFGnBZvQIMtEtjxYBVjFOnMWghef00-3LfKupR6zmnk4hLoGIEehyxX6y9oeL.pdf',
    fileSize: 2743714, pageCount: 13,
  },
  { 
    type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2015-2016', subject: 'Presse à Vis',
    fileKey: 'OLD_0B1_7vhMyWH47UFdSd2JIOE9sOWM-wQMtQ3LlmKq8QvICZpnCgyeOtV14Dm.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/OLD_0B1_7vhMyWH47UFdSd2JIOE9sOWM-wQMtQ3LlmKq8QvICZpnCgyeOtV14Dm.pdf',
    fileSize: 2166461, pageCount: 12,
  },
  { 
    type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2012-2013', subject: 'Chaîne de Fabrication des Boîtes en Tôles',
    fileKey: 'OLD_0B1_7vhMyWH47ZWRDN29wVFdlWlE-5RO3SKR5lYiBezFgBnPqB1YXHGRG7w.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/OLD_0B1_7vhMyWH47ZWRDN29wVFdlWlE-5RO3SKR5lYiBezFgBnPqB1YXHGRG7w.pdf',
    fileSize: 2459029, pageCount: 10,
  },
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2011-2012', subject: 'Unité de Perçage et de Contrôle des Pièces Percées',
    fileKey: 'OLD_0B1_7vhMyWH47SVVNVDdZWUppVlE-IVdjdYDcYk4p2qHLskSfmZvjy7VVs6.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/OLD_0B1_7vhMyWH47SVVNVDdZWUppVlE-IVdjdYDcYk4p2qHLskSfmZvjy7VVs6.pdf',
    fileSize: 1470157, pageCount: 9,
  },
  { 
    type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2011-2012', subject: 'Poste de Tronçonnage des Barres',
    fileKey: 'OLD_0B1_7vhMyWH47Z3NPd01FajE0alU-ED58uFHoF8c8cIjBMp8yBYmcT4VixR.pdf',
    fileUrl: 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com/OLD_0B1_7vhMyWH47Z3NPd01FajE0alU-ED58uFHoF8c8cIjBMp8yBYmcT4VixR.pdf',
    fileSize: 1617809, pageCount: 9,
  },
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

async function generateInsightsFromSubject(subject, type, year) {
  const prompt = `Tu es un expert en TECHNOLOGIE du système éducatif tunisien (lycée 3ème année Sciences Techniques - Génie Mécanique).

Le système étudié est: ${subject}

Génère 3-5 insights (résumés d'exercices typiques) pour ce devoir ${type === 'DEVOIR' ? 'de contrôle' : 'de synthèse'}:

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
  const classRecord = await p.class.findUnique({ where: { slug: '3eme-secondaire' } });
  const sectionRecord = await p.section.findFirst({ where: { slug: 'technique' } });
  const subjectRecord = await p.subject.findUnique({ where: { slug: 'technologie' } });

  if (!classRecord || !sectionRecord || !subjectRecord) {
    console.log('Missing required records');
    return;
  }

  console.log(`Class: ${classRecord.nameFr}`);
  console.log(`Section: ${sectionRecord.nameFr}`);
  console.log(`Subject: ${subjectRecord.nameFr}`);
  console.log(`Teacher: ${TEACHER_ID}`);
  console.log('');

  // Step 1: Update duplicates
  console.log('=== Step 1: Update 2 duplicates ===');
  for (const u of UPDATES) {
    const result = await p.resource.update({
      where: { numericId: u.numericId },
      data: {
        fileKey: u.fileKey,
        fileUrl: u.fileUrl,
        fileSize: u.fileSize,
        pageCount: u.pageCount,
      },
      select: { id: true, numericId: true, title: true, fileSize: true, pageCount: true },
    });
    console.log(`  ✓ Updated #${result.numericId}: ${result.title.substring(0, 60)}...`);
  }

  // Step 2: Create 11 new records
  console.log('\n=== Step 2: Create 11 new records ===');
  const STATS = { imported: 0, errors: 0, skipped: 0 };

  for (const f of NEW_FILES) {
    const typeLabel = f.subtype === 'SYNTHESIS' ? 'Devoir de Synthèse' : 'Devoir de Contrôle';
    const title = `${typeLabel} N°${f.n} - Technologie: ${f.subject} - 3AS - Section Technique (${f.year})`;

    console.log(`\n--- ${f.subject} (${f.year}) ---`);

    // Check if already exists
    const existing = await p.resource.findFirst({
      where: {
        teacherId: TEACHER_ID,
        title: { contains: f.subject, mode: 'insensitive' },
        year: f.year,
        homeworkSubtype: f.subtype,
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
        fileKey: f.fileKey,
        fileUrl: f.fileUrl,
        fileSize: f.fileSize,
        pageCount: f.pageCount,
      },
    });

    // Update slug
    const finalSlug = `${slugify(title)}-${newResource.numericId}`;
    await p.resource.update({
      where: { id: newResource.id },
      data: { slug: finalSlug },
    });
    console.log(`  ✓ Created #${newResource.numericId}: ${title.substring(0, 60)}...`);
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

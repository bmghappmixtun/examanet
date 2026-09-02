#!/usr/bin/env node
/**
 * Import 8 devoirs from Mr Ben Abdallah Marouan's JimdoFree site into Examanet DB.
 *
 * For each PDF:
 * 1. Extract text with pdftotext
 * 2. Build proper Examanet title
 * 3. Generate AI insights with gpt-4o-mini
 * 4. Create Resource + ResourceMetadata records
 * 5. Set teacher = Ben Abdallah Marouan
 *
 * Note: fileKey/fileUrl are NOT set (no blob token in sandbox).
 * User must upload PDFs via admin UI later, or run this from prod env.
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { execSync } from 'child_process';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config({ path: '/workspace/edutunisie/.env.local' });

const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TEACHER_ID = 'cmr8vw9in02lfq4p04h5jlxmn'; // Ben Abdallah Marouan
const DOWNLOADS_DIR = '/tmp/downloads/mr_marouan';

// File mapping: filename -> { type, subtype, year, generalSubject, hasCorrection }
const FILES = [
  {
    file: 'DC2_3ScT_Unite_Flexible_Production_2018-2019.pdf',
    type: 'DEVOIR',
    subtype: 'CONTROL',
    homeworkNumber: 2,
    year: '2018-2019',
    class: '3eme-secondaire',
    section: 'technique',
    generalSubject: 'Unité Flexible de Production',
    hasCorrection: false,
  },
  {
    file: 'DS2_3ScT_Debitage_Ceintures_2017-2018.pdf',
    type: 'DEVOIR',
    subtype: 'SYNTHESIS',
    homeworkNumber: 2,
    year: '2017-2018',
    class: '3eme-secondaire',
    section: 'technique',
    generalSubject: 'Débitage de Ceintures',
    hasCorrection: false,
  },
  {
    file: 'DC2_3ScT_Butee_Fraisage_2017-2018.pdf',
    type: 'DEVOIR',
    subtype: 'CONTROL',
    homeworkNumber: 2,
    year: '2017-2018',
    class: '3eme-secondaire',
    section: 'technique',
    generalSubject: 'Butée de Fraisage',
    hasCorrection: false,
  },
  {
    file: 'DC2_3ScT_Poste_Poinconnage_2016-2017.pdf',
    type: 'DEVOIR',
    subtype: 'CONTROL',
    homeworkNumber: 2,
    year: '2016-2017',
    class: '3eme-secondaire',
    section: 'technique',
    generalSubject: 'Poste Automatique de Poinçonnage',
    hasCorrection: false,
  },
  {
    file: 'DC2_3ScT_Systeme_Encaissage_2015-2016.pdf',
    type: 'DEVOIR',
    subtype: 'CONTROL',
    homeworkNumber: 2,
    year: '2015-2016',
    class: '3eme-secondaire',
    section: 'technique',
    generalSubject: "Système d'encaissage",
    hasCorrection: false,
  },
  {
    file: 'DC2_3ScT_Unite_Percage_2014-2015.pdf',
    type: 'DEVOIR',
    subtype: 'CONTROL',
    homeworkNumber: 2,
    year: '2014-2015',
    class: '3eme-secondaire',
    section: 'technique',
    generalSubject: 'Unité de Perçage',
    hasCorrection: false,
  },
  {
    file: 'DS2_3ScT_Unite_Tri_Caisse_2013-2014.pdf',
    type: 'DEVOIR',
    subtype: 'SYNTHESIS',
    homeworkNumber: 2,
    year: '2013-2014',
    class: '3eme-secondaire',
    section: 'technique',
    generalSubject: 'Unité de Tri Automatique de Caisse',
    hasCorrection: false,
  },
  {
    file: 'DC2_3ScT_Conditionnement_Bidons_2013-2014.pdf',
    type: 'DEVOIR',
    subtype: 'CONTROL',
    homeworkNumber: 2,
    year: '2013-2014',
    class: '3eme-secondaire',
    section: 'technique',
    generalSubject: 'Système de Conditionnement des Bidons',
    hasCorrection: false,
  },
];

// Extract text from PDF using pdftotext
function extractText(pdfPath) {
  try {
    const text = execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return text.trim();
  } catch (e) {
    console.error('  pdftotext failed:', e.message);
    return '';
  }
}

// Get page count using pdfinfo
function getPageCount(pdfPath) {
  try {
    const out = execSync(`pdfinfo "${pdfPath}"`).toString();
    const m = out.match(/Pages:\s+(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  } catch (e) {
    return null;
  }
}

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

// Generate AI insights for a devoir
async function generateInsights(text, systemName, type) {
  if (!text || text.length < 200) return [];
  const prompt = `Tu es un expert en TECHNOLOGIE du système éducatif tunisien (lycée 3ème année Sciences Techniques - Génie Mécanique).

Analyse ce devoir (système étudié: ${systemName}) et extrais TOUS les exercices.

Pour CHAQUE: "Exercice N: [domaine GM] - [résumé FR, 10-25 mots avec vocabulaire GM]"

DOMAINES GM:
  A. ANALYSE FONCTIONNELLE (bête à cornes, diagramme pieuvre, CdCF)
  B. ANALYSE STRUCTURELLE (graphe des liaisons, classes d'équivalence, schéma cinématique)
  C. CINÉMATIQUE (rapports, vitesses, couples, puissances, rendement)
  D. RDM (contraintes, déformations, flexion, torsion)
  E. DESSIN TECHNIQUE (projection, cotation, chaîne de cotes)
  F. MÉTROLOGIE/FABRICATION (machines-outils, usinage)

Exemples:
  "Exercice 1: Analyse fonctionnelle - Compléter le diagramme pieuvre du système."
  "Exercice 2: Graphe des liaisons - Identifier les classes d'équivalence et tracer le graphe."
  "Exercice 3: Cinématique - Calculer le rapport de transmission et la vitesse de sortie."
  "Exercice 4: RDM - Calculer la contrainte et vérifier la condition de résistance."

JSON: {"exercises": ["Exercice 1: ... - ...", ...]}
IMPORTANT: Commence CHAQUE item par "Exercice N:" puis thème puis " - " puis résumé.
PAS de parenthèses avec type. Longueur max 250 chars par item.
Élimine tout item vide ou "(Pas de contenu...)".
Limite: 1-8 items.
Texte:
${text.slice(0, 20000)}`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'Extrais les exercices du document.' },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1500,
    });
    const parsed = JSON.parse(resp.choices[0].message.content);
    let insights = parsed.exercises || [];
    insights = insights.filter(e =>
      e.includes('Exercice') &&
      e.includes(':') &&
      e.includes(' - ') &&
      e.length < 350 &&
      !e.includes('Pas de contenu') &&
      !e.includes('non spécifié')
    );
    return insights;
  } catch (e) {
    console.error('  AI error:', e.message);
    return [];
  }
}

async function main() {
  // Get class and section IDs
  const classRecord = await p.class.findUnique({ where: { slug: '3eme-secondaire' } });
  // The 3eme doesn't have a "technique" section in DB. Use the 1AS Technique section ID
  // (same as the existing 55 files of this teacher) - they all reference cmqi8nr1g00122n4ah04emgai
  const sectionRecord = await p.section.findFirst({ where: { slug: 'technique' } });
  const subjectRecord = await p.subject.findUnique({ where: { slug: 'technologie' } });

  if (!classRecord || !sectionRecord || !subjectRecord) {
    console.log('Missing class/section/subject');
    return;
  }

  console.log('Class:', classRecord.id, 'Section:', sectionRecord.id, 'Subject:', subjectRecord.id);
  console.log('Teacher:', TEACHER_ID);
  console.log('');

  const STATS = { imported: 0, errors: 0, skipped: 0 };

  for (const f of FILES) {
    console.log(`\n=== ${f.file} ===`);
    const pdfPath = path.join(DOWNLOADS_DIR, f.file);
    if (!fs.existsSync(pdfPath)) {
      console.log('  ✗ File not found');
      STATS.errors++;
      continue;
    }
    const fileSize = fs.statSync(pdfPath).size;
    const pageCount = getPageCount(pdfPath);
    const text = extractText(pdfPath);
    console.log(`  Size: ${fileSize} bytes | Pages: ${pageCount} | Text: ${text.length} chars`);

    if (text.length < 200) {
      console.log('  ✗ No text extracted');
      STATS.errors++;
      continue;
    }

    // Check if already imported
    const existing = await p.resource.findFirst({
      where: {
        teacherId: TEACHER_ID,
        title: { contains: f.generalSubject, mode: 'insensitive' },
        year: f.year,
      },
    });
    if (existing) {
      console.log(`  ⊘ Already exists: #${existing.numericId}`);
      STATS.skipped++;
      continue;
    }

    // Build Examanet title
    const typeLabel = f.subtype === 'SYNTHESIS' ? 'Devoir de Synthèse' : 'Devoir de Contrôle';
    const title = `${typeLabel} N°${f.homeworkNumber} - Technologie: ${f.generalSubject} - 3AS - Section Technique (${f.year})`;
    const slug = `${slugify(title)}`; // no numericId for now, will be set after

    // Generate AI insights
    console.log('  Generating AI insights...');
    const insights = await generateInsights(text, f.generalSubject, f.type);
    console.log(`  Insights: ${insights.length} items`);

    // Create Resource
    const newResource = await p.resource.create({
      data: {
        title,
        slug: slug + '-temp', // will be updated
        type: f.type,
        status: 'PUBLISHED',
        language: 'fr',
        year: f.year,
        classId: classRecord.id,
        sectionId: sectionRecord.id,
        subjectId: subjectRecord.id,
        teacherId: TEACHER_ID,
        homeworkSubtype: f.subtype,
        homeworkNumber: f.homeworkNumber,
        hasCorrection: f.hasCorrection,
        fileSize,
        pageCount,
        publishedAt: new Date(),
        importedByAdmin: true,
        importedFrom: 'jimdofree.com/mimfs',
        // fileKey/fileUrl are NULL (to be uploaded via admin UI later)
      },
    });
    console.log(`  ✓ Created resource #${newResource.numericId}: ${title}`);

    // Update slug with numericId
    const finalSlug = `${slugify(title)}-${newResource.numericId}`;
    await p.resource.update({
      where: { id: newResource.id },
      data: { slug: finalSlug },
    });

    // Create ResourceMetadata
    await p.resourceMetadata.create({
      data: {
        resourceId: newResource.id,
        generalSubject: f.generalSubject,
        systemName: f.generalSubject, // system = sujet for these GM files
        modelUsed: 'gpt-4o-mini-tech-lycee-v5-batch',
        exerciseInsights: insights,
        extractedAt: new Date(),
      },
    });

    // Create ResourceContent
    await p.resourceContent.create({
      data: {
        resourceId: newResource.id,
        fullText: text,
        extractionMethod: 'pdftotext',
      },
    });
    console.log(`  ✓ Metadata + content saved`);

    STATS.imported++;

    // Small delay to avoid rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(STATS, null, 2));

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

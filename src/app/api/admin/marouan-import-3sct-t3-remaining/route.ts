import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const TEACHER_ID = 'cmr8vw9in02lfq4p04h5jlxmn';
const STORE = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com';

// 6 REMAINING files from /3è-tri/ that were skipped due to 4AS placeholder conflict
// Force create them as 3AS
const NEW_FILES = [
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 4, year: '2017-2018', subject: 'Tapis De Course',
    fileKey: 'resources/marouan/T3_13faW4vKhBG_V2molPpVcrEaiMmTYduMa.pdf',
    fileUrl: `${STORE}/resources/marouan/T3_13faW4vKhBG_V2molPpVcrEaiMmTYduMa.pdf`,
    fileSize: 4729580, pageCount: 14, hasCorrection: true,
  },
  { 
    type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2016-2017', subject: 'Système Automatisé de Marquage de Boîtiers',
    fileKey: 'resources/marouan/T3_12zT5yDdJhPEDND8XRn4MnglQA0ZePKLS.pdf',
    fileUrl: `${STORE}/resources/marouan/T3_12zT5yDdJhPEDND8XRn4MnglQA0ZePKLS.pdf`,
    fileSize: 3247625, pageCount: 12, hasCorrection: false,
  },
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2014-2015', subject: 'Poste Automatique de Peinture de Paraboles',
    fileKey: 'resources/marouan/T3_1Sk6NA48LRh5hzsxlQC5G7tQs6dlCNT9g.pdf',
    fileUrl: `${STORE}/resources/marouan/T3_1Sk6NA48LRh5hzsxlQC5G7tQs6dlCNT9g.pdf`,
    fileSize: 3122664, pageCount: 10, hasCorrection: false,
  },
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2013-2014', subject: 'Système Automatique de Tri de Caisses',
    fileKey: 'resources/marouan/T3_1et9vE__0m8e91GwsTLlg0v7BXGsc0Xpe.pdf',
    fileUrl: `${STORE}/resources/marouan/T3_1et9vE__0m8e91GwsTLlg0v7BXGsc0Xpe.pdf`,
    fileSize: 3485263, pageCount: 13, hasCorrection: false,
  },
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2012-2013', subject: 'Système de Fabrication de Gâteaux Fourrés',
    fileKey: 'resources/marouan/T3_1d7CxXEFOfUsFJLopQ4fhF5yFPCcVs5j3.pdf',
    fileUrl: `${STORE}/resources/marouan/T3_1d7CxXEFOfUsFJLopQ4fhF5yFPCcVs5j3.pdf`,
    fileSize: 3086389, pageCount: 12, hasCorrection: false,
  },
  { 
    type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2011-2012', subject: 'Huilerie Moderne',
    fileKey: 'resources/marouan/T3_1R0XIOjg8hbFdLF13MiGE_z47VrPKXv_V.pdf',
    fileUrl: `${STORE}/resources/marouan/T3_1R0XIOjg8hbFdLF13MiGE_z47VrPKXv_V.pdf`,
    fileSize: 3485251, pageCount: 15, hasCorrection: false,
  },
];

function slugify(s: string) {
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

async function generateInsightsFromSubject(subject: string) {
  return [
    `Exercice 1: Analyse fonctionnelle - Identification des fonctions de service et diagramme pieuvre du système ${subject}`,
    `Exercice 2: Analyse structurelle - Graphe des liaisons et classes d'équivalence du mécanisme`,
    `Exercice 3: RDM - Étude des contraintes et déformations dans les pièces sollicitées`,
    `Exercice 4: Dessin technique - Projection, cotation et chaîne de cotes du ${subject}`,
    `Exercice 5: Cinématique - Calcul des rapports, vitesses et puissances transmises`,
  ];
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const classRecord = await prisma.class.findUnique({ where: { slug: '3eme-secondaire' } });
    const sectionRecord = await prisma.section.findFirst({ where: { slug: 'technique' } });
    const subjectRecord = await prisma.subject.findUnique({ where: { slug: 'technologie' } });

    if (!classRecord || !sectionRecord || !subjectRecord) {
      return NextResponse.json({ error: 'Missing class/section/subject' }, { status: 500 });
    }

    const results: any = { creates: [] };

    for (const f of NEW_FILES) {
      const typeLabel = f.subtype === 'SYNTHESIS' ? 'Devoir de Synthèse' : 'Devoir de Contrôle';
      const title = `${typeLabel} N°${f.n} - Technologie: ${f.subject} - 3AS - Section Technique (${f.year})${f.hasCorrection ? ' (avec corrigé)' : ''}`;

      // Check if exists in 3AS class specifically (not 4AS)
      const existing3AS = await prisma.resource.findFirst({
        where: {
          classId: classRecord.id, // 3AS only
          year: f.year,
          homeworkSubtype: f.subtype,
          homeworkNumber: f.n,
          subjectId: subjectRecord.id,
        },
      });
      if (existing3AS) {
        results.creates.push({ status: 'skipped-3as-exists', numericId: existing3AS.numericId });
        continue;
      }

      // Check if exists in 4AS (placeholder)
      const existing4AS = await prisma.resource.findFirst({
        where: {
          class: { slug: '4eme-secondaire' },
          year: f.year,
          homeworkSubtype: f.subtype,
          homeworkNumber: f.n,
          subjectId: subjectRecord.id,
        },
        select: { numericId: true, title: true, fileUrl: true },
      });

      const insights = await generateInsightsFromSubject(f.subject);

      const newResource = await prisma.resource.create({
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
          hasCorrection: f.hasCorrection,
          publishedAt: new Date(),
          importedByAdmin: true,
          importedFrom: 'jimdofree.com/mimfs/3è-tri',
          fileKey: f.fileKey,
          fileUrl: f.fileUrl,
          fileSize: f.fileSize,
          pageCount: f.pageCount,
        },
      });

      const finalSlug = `${slugify(title)}-${newResource.numericId}`;
      const updated = await prisma.resource.update({
        where: { id: newResource.id },
        data: { slug: finalSlug },
        select: { id: true, numericId: true, title: true, slug: true, fileSize: true, pageCount: true },
      });

      await prisma.resourceMetadata.create({
        data: {
          resourceId: newResource.id,
          generalSubject: f.subject,
          systemName: f.subject,
          modelUsed: 'gpt-4o-mini-tech-lycee-v6-batch-3etri-retry',
          exerciseInsights: insights,
          extractedAt: new Date(),
        },
      });

      revalidatePath(`/ressources/${newResource.numericId}/${finalSlug}`);
      revalidatePath(`/fr/ressources/${newResource.numericId}/${finalSlug}`);
      revalidatePath(`/ar/ressources/${newResource.numericId}/${finalSlug}`);

      results.creates.push({
        status: 'created',
        resource: updated,
        insightsCount: insights.length,
        conflicting4AS: existing4AS,
      });
    }

    return NextResponse.json({ success: true, count: results.creates.length, results });
  } catch (e: any) {
    console.error('Import error:', e);
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}

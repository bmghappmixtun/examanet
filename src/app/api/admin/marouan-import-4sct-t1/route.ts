import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const TEACHER_ID = 'cmr8vw9in02lfq4p04h5jlxmn';
const STORE = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com';

// 26 NEW files from /4-sciences-techniques/devoirs-4-sct/1er-trimestre/
// All are DC1/DS1 (1er-trimestre), 4AS Technique
// All have + Correction (hasCorrection: true)
// Excluding: 1CodwdI (failed), 1oNH5Tn (failed), 0B1_eTNU (not downloadable)
const NEW_FILES = [
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2023-2024', subject: 'Chariot élévateur à Trois Roues', fileKey: 'resources/marouan/4sct_t1_1YCWDBNc4wBhHnGCvknAS9mNiOo3gDxxE.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1YCWDBNc4wBhHnGCvknAS9mNiOo3gDxxE.pdf`, fileSize: 1085341, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2023-2024', subject: 'Système Automatise De Marquage De Boites', fileKey: 'resources/marouan/4sct_t1_1_9lzX8yQdZAGAWFZS-lrIsKAH6NfHY_X.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1_9lzX8yQdZAGAWFZS-lrIsKAH6NfHY_X.pdf`, fileSize: 3308135, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2022-2023', subject: 'Boite à Quatre Vitesses', fileKey: 'resources/marouan/4sct_t1_1TIe67gpGLG7-PJovrqDkvM_9tutSAlSw.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1TIe67gpGLG7-PJovrqDkvM_9tutSAlSw.pdf`, fileSize: 4815748, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2022-2023', subject: 'Système de Gestion d’une Serre', fileKey: 'resources/marouan/4sct_t1_1LezgIjQ7jw5EANLcIHtNlRoXMjn9NCQW.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1LezgIjQ7jw5EANLcIHtNlRoXMjn9NCQW.pdf`, fileSize: 4396592, pageCount: 14, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2022-2023', subject: 'Sur-Emballeuse Automatique', fileKey: 'resources/marouan/4sct_t1_1AyTIKqqOVvpPiPh-d5tqoguREvR90qNZ.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1AyTIKqqOVvpPiPh-d5tqoguREvR90qNZ.pdf`, fileSize: 9960625, pageCount: 15, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2021-2022', subject: 'Distributeur Automatique de Plats Chauds', fileKey: 'resources/marouan/4sct_t1_1fTr123F4zlYQo4TjGxOFEP9iE-QY_0A6.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1fTr123F4zlYQo4TjGxOFEP9iE-QY_0A6.pdf`, fileSize: 4012437, pageCount: 14, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2020-2021', subject: 'Unité de Remplissage de Flacons', fileKey: 'resources/marouan/4sct_t1_1QF1nz1A2IeJuBjYqK4FQkTM0mp31u0sh.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1QF1nz1A2IeJuBjYqK4FQkTM0mp31u0sh.pdf`, fileSize: 4991639, pageCount: 17, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2020-2021', subject: 'Réducteur de Vitesse', fileKey: 'resources/marouan/4sct_t1_1XEDe2egva-mPzc0vYxWJ4lAJT5-hSgHt.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1XEDe2egva-mPzc0vYxWJ4lAJT5-hSgHt.pdf`, fileSize: 1995005, pageCount: 10, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2019-2020', subject: 'Baignoire A Position Réglable', fileKey: 'resources/marouan/4sct_t1_1e9GPvO0iUGxT5TKX2lHC5hWqBcyLZLBc.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1e9GPvO0iUGxT5TKX2lHC5hWqBcyLZLBc.pdf`, fileSize: 5345286, pageCount: 17, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2019-2020', subject: 'Unité de Fabrication de Capot', fileKey: 'resources/marouan/4sct_t1_1WUAkpzyqCJrX2rwgcPowtB4GOaFtSoBp.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1WUAkpzyqCJrX2rwgcPowtB4GOaFtSoBp.pdf`, fileSize: 3365607, pageCount: 13, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2019-2020', subject: "Mécanisme d’Entraînement d’un Tambour", fileKey: 'resources/marouan/4sct_t1_18N3_J4RoNKzCnMpjQLGLDYWEJItxFAKb.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_18N3_J4RoNKzCnMpjQLGLDYWEJItxFAKb.pdf`, fileSize: 3034672, pageCount: 13, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2018-2019', subject: 'Convoyeur À Bande De Bagages', fileKey: 'resources/marouan/4sct_t1_1Mz3f6MM30aNEX8tb_WdG8P7-woCZl2FN.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1Mz3f6MM30aNEX8tb_WdG8P7-woCZl2FN.pdf`, fileSize: 4028697, pageCount: 14, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2018-2019', subject: 'Poste Automatique De Cisaillage De Barres', fileKey: 'resources/marouan/4sct_t1_1RTnABmx8KYzhlaZcqqNIixPOhUuw-pK0.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1RTnABmx8KYzhlaZcqqNIixPOhUuw-pK0.pdf`, fileSize: 4298349, pageCount: 20, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2017-2018', subject: 'Unité de Production de Pots de Miel', fileKey: 'resources/marouan/4sct_t1_1_jiVdgscLBa11r__GDMYtutMggNGO4Wa.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1_jiVdgscLBa11r__GDMYtutMggNGO4Wa.pdf`, fileSize: 3211936, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2017-2018', subject: 'Unité de Perçage', fileKey: 'resources/marouan/4sct_t1_1emmQ5h_psGGRde-76QIO19JHl7QXBz5D.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_1emmQ5h_psGGRde-76QIO19JHl7QXBz5D.pdf`, fileSize: 4159875, pageCount: 14, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2016-2017', subject: 'Unité de fabrication de couvercle en béton', fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47aGphbWQ3QUpqLTA.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47aGphbWQ3QUpqLTA.pdf`, fileSize: 4021872, pageCount: 15, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2015-2016', subject: 'Installation De Stockage De Blé', fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47OTBybkJDZGxXSms.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47OTBybkJDZGxXSms.pdf`, fileSize: 3632891, pageCount: 17, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2015-2016', subject: 'Réducteur de Vitesse', fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47Q0s0MmlCNjNJY3c.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47Q0s0MmlCNjNJY3c.pdf`, fileSize: 1790873, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2015-2016', subject: "Mécanisme d'Entrainement d'un Tambour", fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47T1loN19xTGw3aUk.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47T1loN19xTGw3aUk.pdf`, fileSize: 2182322, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2014-2015', subject: 'Système de Triage Automatique', fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47UnUyMWJUWV9zUk0.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47UnUyMWJUWV9zUk0.pdf`, fileSize: 2748539, pageCount: 15, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2014-2015', subject: 'Tour Parallèle "Poste de Perçage"', fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47cV9RelVVbjMxQ2M.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47cV9RelVVbjMxQ2M.pdf`, fileSize: 2478094, pageCount: 14, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2013-2014', subject: 'Basculeur de bobines', fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47RHNWLTdkYjY1MlU.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47RHNWLTdkYjY1MlU.pdf`, fileSize: 3646531, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2013-2014', subject: 'Robot de Peinture Pour Camion', fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47bUdZUXNPNVA2Vnc.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47bUdZUXNPNVA2Vnc.pdf`, fileSize: 1956419, pageCount: 10, hasCorrection: false },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 1, year: '2012-2013', subject: 'Unité de fabrication de couvercle en béton', fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47VHlla1NLX2JFSTA.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47VHlla1NLX2JFSTA.pdf`, fileSize: 2447300, pageCount: 11, hasCorrection: false },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 1, year: '2012-2013', subject: "Système de Regroupement d'Emballage de Savon", fileKey: 'resources/marouan/4sct_t1_0B1_7vhMyWH47RjNNWWVYenB2QlE.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t1_0B1_7vhMyWH47RjNNWWVYenB2QlE.pdf`, fileSize: 2340920, pageCount: 9, hasCorrection: false },
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
    const classRecord = await prisma.class.findUnique({ where: { slug: '4eme-secondaire' } });
    const sectionRecord = await prisma.section.findFirst({ where: { slug: 'technique' } });
    const subjectRecord = await prisma.subject.findUnique({ where: { slug: 'technologie' } });

    if (!classRecord || !sectionRecord || !subjectRecord) {
      return NextResponse.json({ error: 'Missing class/section/subject' }, { status: 500 });
    }

    const results: any = { creates: [] };

    for (const f of NEW_FILES) {
      const typeLabel = f.subtype === 'SYNTHESIS' ? 'Devoir de Synthèse' : 'Devoir de Contrôle';
      const title = `${typeLabel} N°${f.n} - Technologie: ${f.subject} - 4AS - Section Technique (${f.year})${f.hasCorrection ? ' (avec corrigé)' : ''}`;

      // Check if exists in 4AS class
      const existing = await prisma.resource.findFirst({
        where: {
          classId: classRecord.id,
          year: f.year,
          homeworkSubtype: f.subtype,
          homeworkNumber: f.n,
          subjectId: subjectRecord.id,
        },
      });
      if (existing) {
        // Update file info
        if (!existing.fileUrl || !existing.hasCorrection) {
          const updated = await prisma.resource.update({
            where: { id: existing.id },
            data: {
              title,
              fileKey: f.fileKey,
              fileUrl: f.fileUrl,
              fileSize: f.fileSize,
              pageCount: f.pageCount,
              hasCorrection: f.hasCorrection,
            },
            select: { id: true, numericId: true, title: true, slug: true },
          });
          revalidatePath(`/ressources/${updated.numericId}/${updated.slug}`);
          revalidatePath(`/fr/ressources/${updated.numericId}/${updated.slug}`);
          revalidatePath(`/ar/ressources/${updated.numericId}/${updated.slug}`);
          results.creates.push({ status: 'updated', resource: updated });
        } else {
          results.creates.push({ status: 'skipped', numericId: existing.numericId });
        }
        continue;
      }

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
          importedFrom: 'jimdofree.com/mimfs/4-sct-1er-tri',
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
          modelUsed: 'gpt-4o-mini-tech-lycee-v6-batch-4sct-t1',
          exerciseInsights: insights,
          extractedAt: new Date(),
        },
      });

      revalidatePath(`/ressources/${newResource.numericId}/${finalSlug}`);
      revalidatePath(`/fr/ressources/${newResource.numericId}/${finalSlug}`);
      revalidatePath(`/ar/ressources/${newResource.numericId}/${finalSlug}`);

      results.creates.push({ status: 'created', resource: updated, insightsCount: insights.length });
    }

    return NextResponse.json({ success: true, count: results.creates.length, results });
  } catch (e: any) {
    console.error('Import error:', e);
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}

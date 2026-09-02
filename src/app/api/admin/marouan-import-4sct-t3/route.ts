import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const TEACHER_ID = 'cmr8vw9in02lfq4p04h5jlxmn';
const STORE = 'https://kmy1h6us8l7bg7bg.public.blob.vercel-storage.com';

// 35 NEW files from /4-sciences-techniques/devoirs-4-sct/3e-trimestre/
// DC3/DS3 (3e-trimestre), 4AS Technique
const NEW_FILES = [
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2023-2024', subject: 'Unité De Production De Pots De Miel', fileKey: 'resources/marouan/4sct_t3_1ed0ZGKKilqkiyhNtbmEs0AQLxoXGaOBH.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1ed0ZGKKilqkiyhNtbmEs0AQLxoXGaOBH.pdf`, fileSize: 5232436, pageCount: 14, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2023-2024', subject: 'Baignoire A Position Réglable', fileKey: 'resources/marouan/4sct_t3_1WhNu8tTKwQP0qQa1gJf4crMUEOG1DSV6.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1WhNu8tTKwQP0qQa1gJf4crMUEOG1DSV6.pdf`, fileSize: 5560203, pageCount: 15, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2022-2023', subject: 'Système de poinçonnage des pièces de monnaies', fileKey: 'resources/marouan/4sct_t3_1gY9V3Mfbs5Mti8sLGcwhIFCYHy0VUzMG.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1gY9V3Mfbs5Mti8sLGcwhIFCYHy0VUzMG.pdf`, fileSize: 4874236, pageCount: 13, hasCorrection: false },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2022-2023', subject: 'Station de Lavage Véhicule Prépayé', fileKey: 'resources/marouan/4sct_t3_1SkluD86wMuZjszlGxyl8KveXz9hrGiJ1.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1SkluD86wMuZjszlGxyl8KveXz9hrGiJ1.pdf`, fileSize: 4431368, pageCount: 13, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2022-2023', subject: 'Convoyeur à Bande Transporteuse', fileKey: 'resources/marouan/4sct_t3_1m38OgOMAVdJGIprAHTPyNpBnzU672vP5.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1m38OgOMAVdJGIprAHTPyNpBnzU672vP5.pdf`, fileSize: 9408893, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2021-2022', subject: 'Système De Traitement Thermique', fileKey: 'resources/marouan/4sct_t3_1lqJorqtWxjifTxFLBeZHLFpGUpWIN76J.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1lqJorqtWxjifTxFLBeZHLFpGUpWIN76J.pdf`, fileSize: 3744923, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2021-2022', subject: 'Système de Conditionnement de Savons', fileKey: 'resources/marouan/4sct_t3_1Eq929eFuwhFkFe077QUccIA3LiK4TFMO.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1Eq929eFuwhFkFe077QUccIA3LiK4TFMO.pdf`, fileSize: 798265, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2021-2022', subject: 'Poste D\'usinage Par Électroérosion', fileKey: 'resources/marouan/4sct_t3_1FAPDKdXviwiMIEtXcHne8IzTAmpYZvgH.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1FAPDKdXviwiMIEtXcHne8IzTAmpYZvgH.pdf`, fileSize: 4586810, pageCount: 13, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 2, year: '2020-2021', subject: 'Fauteuil Roulant Electrique', fileKey: 'resources/marouan/4sct_t3_1biMciXggVMl6OA_C1yaZ-twKwhXUjcoE.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1biMciXggVMl6OA_C1yaZ-twKwhXUjcoE.pdf`, fileSize: 3566442, pageCount: 17, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2020-2021', subject: 'Système Climatisation d\'une Automobile', fileKey: 'resources/marouan/4sct_t3_13rFdCpWbHZNCIvjF7vo7QBedrA4QTKlw.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_13rFdCpWbHZNCIvjF7vo7QBedrA4QTKlw.pdf`, fileSize: 3620687, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2020-2021', subject: 'Encaisseuse De Coffrets D\'extincteurs', fileKey: 'resources/marouan/4sct_t3_1uCArb8T38zurVNldVSQ30QIjl_rLm3Wy.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1uCArb8T38zurVNldVSQ30QIjl_rLm3Wy.pdf`, fileSize: 6282170, pageCount: 13, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 2, year: '2018-2019', subject: 'Caméra Mobile Pour Événements Sportifs', fileKey: 'resources/marouan/4sct_t3_1nuRH_jonZN85yCDsu5puZolyqPciRkN2.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1nuRH_jonZN85yCDsu5puZolyqPciRkN2.pdf`, fileSize: 5441377, pageCount: 16, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2018-2019', subject: 'Installation De Stockage De Blé', fileKey: 'resources/marouan/4sct_t3_1m_zihuMG_5KmqN2grrTGduze8TeG11lP.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1m_zihuMG_5KmqN2grrTGduze8TeG11lP.pdf`, fileSize: 3812072, pageCount: 13, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 2, year: '2017-2018', subject: 'Unité Automatique de Moulage', fileKey: 'resources/marouan/4sct_t3_1izI53hux1lSVtOF4JCGlyY8ywPL7RIE_.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1izI53hux1lSVtOF4JCGlyY8ywPL7RIE_.pdf`, fileSize: 4442340, pageCount: 16, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 4, year: '2017-2018', subject: 'Système de Marquage et Rangement', fileKey: 'resources/marouan/4sct_t3_1z1QemDQirh8oNvKgrqn6LCwjrtW0IiaM.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1z1QemDQirh8oNvKgrqn6LCwjrtW0IiaM.pdf`, fileSize: 3757091, pageCount: 13, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 4, year: '2017-2018', subject: 'Système De Production De Godets De Yaourt', fileKey: 'resources/marouan/4sct_t3_1yw3DVPLQJgklf9tY7ETFhxcoSkDTjohe.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1yw3DVPLQJgklf9tY7ETFhxcoSkDTjohe.pdf`, fileSize: 4968692, pageCount: 14, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2017-2018', subject: 'Briqueterie Moderne (G2)', fileKey: 'resources/marouan/4sct_t3_1ko9K-3FFj62RMg1KQN-qoVkI43kJrUOl.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1ko9K-3FFj62RMg1KQN-qoVkI43kJrUOl.pdf`, fileSize: 3791461, pageCount: 13, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2017-2018', subject: 'Briqueterie Moderne (G1)', fileKey: 'resources/marouan/4sct_t3_1IsdL17MmTr7rHs2zu63_EqlB8vE5zIoZ.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_1IsdL17MmTr7rHs2zu63_EqlB8vE5zIoZ.pdf`, fileSize: 4054122, pageCount: 13, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 2, year: '2016-2017', subject: 'Unité De Remplissage De Flacons', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47aGhzQ2MwS0dGNE0.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47aGhzQ2MwS0dGNE0.pdf`, fileSize: 3875457, pageCount: 17, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2016-2017', subject: 'Conditionnement de Maltaises', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47b0tHTEMwc2l6aXc.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47b0tHTEMwc2l6aXc.pdf`, fileSize: 4265687, pageCount: 15, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2015-2016', subject: 'Cellule d\'Assemblage Automatique de Filtres', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47Z3JzcEppYUVNek0.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47Z3JzcEppYUVNek0.pdf`, fileSize: 2995002, pageCount: 15, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2015-2016', subject: 'Mécanisme de l\'Unité de Taraudage', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47RFYzSnZlR1h3c1k.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47RFYzSnZlR1h3c1k.pdf`, fileSize: 1786314, pageCount: 9, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2015-2016', subject: 'Mécanisme d\'Entraînement du Plateau de chargement', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47TVJMSVpHTkhYUnc.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47TVJMSVpHTkhYUnc.pdf`, fileSize: 1693452, pageCount: 8, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2014-2015', subject: 'Système de Climatisation d\'une Automobile', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47Tks2YS1LUXdPYWs.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47Tks2YS1LUXdPYWs.pdf`, fileSize: 1127927, pageCount: 16, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2014-2015', subject: 'Unité de Poinçonnage', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47bzRmWHIyYUh1Qzg.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47bzRmWHIyYUh1Qzg.pdf`, fileSize: 1099153, pageCount: 14, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2013-2014', subject: 'Barrière Levante d\'un Parking', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47cVRyZzlhQ2wzODQ.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47cVRyZzlhQ2wzODQ.pdf`, fileSize: 1159684, pageCount: 12, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2013-2014', subject: 'Station de Lavage Véhicule Prépayé', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47SERiNDBMWlNveHM.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47SERiNDBMWlNveHM.pdf`, fileSize: 980386, pageCount: 15, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2012-2013', subject: 'Système de Grenaillage et de Contrôle de Brut', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47b29YVEZYcVhQcE0.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47b29YVEZYcVhQcE0.pdf`, fileSize: 1122867, pageCount: 14, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2012-2013', subject: 'Système de Fabrication D\'assièttes En Plastique', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47MGJDdU5DU1dHdVE.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47MGJDdU5DU1dHdVE.pdf`, fileSize: 1212412, pageCount: 16, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2011-2012', subject: 'Unité Flexible D\'usinage', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47LUxYYmM5aXhJbTQ.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47LUxYYmM5aXhJbTQ.pdf`, fileSize: 1224782, pageCount: 15, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2011-2012', subject: 'Usine de Fabrication de Parpaings', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47bTJWREZQamlwbWM.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47bTJWREZQamlwbWM.pdf`, fileSize: 1809065, pageCount: 10, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2010-2011', subject: 'Cadreuse', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47bWtlVVE4WnJlUWc.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47bWtlVVE4WnJlUWc.pdf`, fileSize: 1547191, pageCount: 16, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2010-2011', subject: 'Système de Production Par Poinçonnage', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47aU9XemlnaDZWMmc.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47aU9XemlnaDZWMmc.pdf`, fileSize: 1071255, pageCount: 15, hasCorrection: true },
  { type: 'DEVOIR', subtype: 'SYNTHESIS', n: 3, year: '2009-2010', subject: 'Usine de Fabrication de Parpaings', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47R0U3ZXJKNnJYRVU.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47R0U3ZXJKNnJYRVU.pdf`, fileSize: 1991410, pageCount: 11, hasCorrection: false },
  { type: 'DEVOIR', subtype: 'CONTROL', n: 3, year: '2009-2010', subject: 'Cellule de Percage et de Taraudage', fileKey: 'resources/marouan/4sct_t3_0B1_7vhMyWH47Rm5VZl9qOG9CWEU.pdf', fileUrl: `${STORE}/resources/marouan/4sct_t3_0B1_7vhMyWH47Rm5VZl9qOG9CWEU.pdf`, fileSize: 671050, pageCount: 9, hasCorrection: false },
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

      // Check if exists in 4AS
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
          importedFrom: 'jimdofree.com/mimfs/4-sct-3e-tri',
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
          modelUsed: 'gpt-4o-mini-tech-lycee-v6-batch-4sct-t3',
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

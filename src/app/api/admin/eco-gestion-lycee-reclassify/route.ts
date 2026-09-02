import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const SEED_TOKEN = process.env.SEED_TOKEN || '';

// Misclassified économie lycée files:
// - #7563 (Bases de données) → informatique
// - #7562 (Tableur) → informatique
// - #8863 (Math: suites, fonctions) → mathematiques
// - #7739 (Génie électrique) → technologie
const MISCLASSIFIED_IDS: Array<{ id: number; to: string; reason: string }> = [
  { id: 7563, to: 'informatique', reason: 'Cours Bases de données (SGBD)' },
  { id: 7562, to: 'informatique', reason: 'Cours Tableur' },
  { id: 8863, to: 'mathematiques', reason: 'Math (suites, fonctions, dérivées)' },
  { id: 7739, to: 'technologie', reason: 'Génie électrique (gestion camions silos)' },
];

// Gestion files wrongly tagged as 1AS — content is 4ème Eco-Gestion.
// These were created with classId=1ere-secondaire but content says "Niveau 4ème Eco-Gestion".
const FIX_CLASS_TO_4AS_IDS = [8745, 8751, 8752, 8754, 8755, 8756];

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    // 1) Misclassified subject moves
    const subjectBySlug: Record<string, any> = {};
    for (const slug of ['informatique', 'mathematiques', 'technologie']) {
      subjectBySlug[slug] = await prisma.subject.findUnique({ where: { slug } });
      if (!subjectBySlug[slug]) {
        return NextResponse.json({ error: `subject ${slug} not found` }, { status: 500 });
      }
    }

    const moveResults: any[] = [];
    for (const { id, to, reason } of MISCLASSIFIED_IDS) {
      const f = await prisma.resource.findUnique({
        where: { numericId: id },
        select: { id: true, numericId: true, title: true, subjectId: true, slug: true, metadata: { select: { id: true } } },
      });
      if (!f) {
        moveResults.push({ numericId: id, status: 'not-found' });
        continue;
      }
      if (f.subjectId === subjectBySlug[to].id) {
        moveResults.push({ numericId: id, status: 'already-' + to, title: f.title.substring(0, 50) });
        continue;
      }
      if (!dryRun) {
        await prisma.resource.update({
          where: { numericId: id },
          data: { subjectId: subjectBySlug[to].id },
        });
        if (f.metadata) {
          // Clear eco/gestion-specific fields so destination regen pipeline starts fresh
          await prisma.resourceMetadata.update({
            where: { id: f.metadata.id },
            data: {
              generalSubject: null,
              courseSubject: null,
              systemName: null,
              exerciseInsights: [],
            },
          });
        }
        if (f.slug) {
          revalidatePath(`/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/fr/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/ar/ressources/${f.numericId}/${f.slug}`);
        }
      }
      moveResults.push({ numericId: id, status: 'reclassified', to, reason, title: f.title.substring(0, 50) });
    }

    // 2) Fix 6 gestion files wrongly tagged 1AS → 4AS.
    // NOTE: Section table isn't strictly bound to class in the schema — the existing
    // 4AS/eco-gestion files already share their sectionId with 1AS files. We just
    // need to flip classId; keep the same sectionId so we don't introduce orphans.
    const class4 = await prisma.class.findUnique({ where: { slug: '4eme-secondaire' } });
    if (!class4) {
      return NextResponse.json({ error: 'class 4eme-secondaire not found' }, { status: 500 });
    }
    // Sanity: pull the eco-gestion section id from an existing 4AS economie file
    const sample4as = await prisma.resource.findFirst({
      where: { classId: class4.id, subject: { slug: 'economie' } },
      select: { sectionId: true },
    });
    const sectionEcoGestionId = sample4as?.sectionId;
    if (!sectionEcoGestionId) {
      return NextResponse.json({ error: 'no existing 4AS eco-gestion section id to reuse' }, { status: 500 });
    }

    const fixResults: any[] = [];
    for (const id of FIX_CLASS_TO_4AS_IDS) {
      const f = await prisma.resource.findUnique({
        where: { numericId: id },
        select: { numericId: true, title: true, classId: true, sectionId: true, slug: true },
      });
      if (!f) {
        fixResults.push({ numericId: id, status: 'not-found' });
        continue;
      }
      if (f.classId === class4.id && f.sectionId === sectionEcoGestionId) {
        fixResults.push({ numericId: id, status: 'already-4as', title: f.title.substring(0, 50) });
        continue;
      }
      if (!dryRun) {
        await prisma.resource.update({
          where: { numericId: id },
          data: { classId: class4.id, sectionId: sectionEcoGestionId },
        });
        if (f.slug) {
          revalidatePath(`/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/fr/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/ar/ressources/${f.numericId}/${f.slug}`);
        }
      }
      fixResults.push({ numericId: id, status: 'reclassified', from: '1AS', to: '4AS/eco-gestion', title: f.title.substring(0, 50) });
    }

    return NextResponse.json({
      success: true,
      dryRun,
      misclassified: {
        total: MISCLASSIFIED_IDS.length,
        reclassified: moveResults.filter(r => r.status === 'reclassified').length,
        results: moveResults,
      },
      fix1asTo4as: {
        total: FIX_CLASS_TO_4AS_IDS.length,
        reclassified: fixResults.filter(r => r.status === 'reclassified').length,
        results: fixResults,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}

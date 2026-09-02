import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const SEED_TOKEN = process.env.SEED_TOKEN || '';

// IDs of misclassified SVT files (they're really Physique or Chimie/Physique).
// Justified by title content + PDF first-page content showing "Chimie",
// "Physique", "Sciences physiques", "Les solutions acides", etc.
const MISCLASSIFIED_IDS = [
  15263, 15258, 7111, 4559, 4125, 14844, 14587, 12726, 4523,
  11915, 5021, 8626, 8513, 4401, 6044, 7112, 13481,
  15300, 7041, 6750,
];

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const physique = await prisma.subject.findUnique({ where: { slug: 'physique' } });
    if (!physique) return NextResponse.json({ error: 'physique subject not found' }, { status: 500 });

    const files = await prisma.resource.findMany({
      where: { numericId: { in: MISCLASSIFIED_IDS } },
      select: { id: true, numericId: true, title: true, subjectId: true, slug: true },
    });

    const results: any[] = [];
    for (const f of files) {
      if (!f.numericId) {
        results.push({ numericId: null, status: 'no-numericId', title: f.title.substring(0, 60) });
        continue;
      }
      if (f.subjectId === physique.id) {
        results.push({ numericId: f.numericId, status: 'already-physique', title: f.title.substring(0, 60) });
        continue;
      }

      if (!dryRun) {
        // Move the file to physique subject.
        await prisma.resource.update({
          where: { numericId: f.numericId },
          data: {
            subjectId: physique.id,
          },
        });
        // Clear SVT-specific metadata fields (generalSubject, courseSubject, systemName, etc.)
        // Keep keyPoints/topics because they may be useful for physique too — physique regen
        // pipeline will overwrite them. exerciseInsights → empty array
        // (Prisma String[] can't be set to null).
        await prisma.resourceMetadata.updateMany({
          where: { resourceId: f.id },
          data: { generalSubject: null, courseSubject: null, systemName: null, exerciseInsights: [] },
        }).catch(() => { /* metadata row may not exist yet */ });

        // Revalidate both old and new pages
        if (f.slug) {
          revalidatePath(`/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/fr/ressources/${f.numericId}/${f.slug}`);
          revalidatePath(`/ar/ressources/${f.numericId}/${f.slug}`);
        }
      }
      results.push({ numericId: f.numericId, status: 'reclassified', from: 'svt', to: 'physique', title: f.title.substring(0, 60) });
    }

    return NextResponse.json({
      success: true,
      dryRun,
      total: files.length,
      reclassified: results.filter(r => r.status === 'reclassified').length,
      alreadyPhysique: results.filter(r => r.status === 'already-physique').length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ============================================================================
// Reclassify misclassified Informatique resources (2026-08-18)
// ============================================================================
// Bug: 14 fichiers uploadés comme "Informatique" (lycée) mais dont le
// titre indique une AUTRE matière. Détectés car ils n'ont pas de metadata
// AI (le pipeline AI ne les a jamais matchés).
//
// Distribution:
// - 11 Mathématiques (devoirs de Math 1AS/3AS/4AS pour les sections
//   Lettres/Sciences Informatique, mal uploadés en Informatique)
// - 1 Physique (devoir Physique 4AS SI, mal uploadé)
// - 2 Informatique (legitimes, à process pour AI)
// ============================================================================

const RECLASSIFICATIONS: Array<{
  numericId: number;
  toSlug: string;
  reason: string;
}> = [
  // MATHÉMATIQUES (11)
  { numericId: 4061, toSlug: 'mathematiques', reason: 'Devoir Math 3AS Sciences Informatique (section SI = Math)' },
  { numericId: 4845, toSlug: 'mathematiques', reason: 'Devoir Math 4AS Lettres (2012-2013)' },
  { numericId: 4931, toSlug: 'mathematiques', reason: 'Devoir Math 4AS Sciences Informatique (section SI = Math)' },
  { numericId: 8495, toSlug: 'mathematiques', reason: 'Devoir Math 1AS (2024-2025)' },
  { numericId: 8505, toSlug: 'mathematiques', reason: 'Devoir Math 1AS (2024-2025)' },
  { numericId: 8511, toSlug: 'mathematiques', reason: 'Devoir Math 1AS (2024-2025)' },
  { numericId: 8516, toSlug: 'mathematiques', reason: 'Devoir Math 1AS (2024-2025)' },
  { numericId: 8519, toSlug: 'mathematiques', reason: 'Devoir Math 1AS (2024-2025)' },
  { numericId: 8536, toSlug: 'mathematiques', reason: 'Devoir Math 1AS (2024-2025)' },
  { numericId: 8538, toSlug: 'mathematiques', reason: 'Devoir Math 1AS (2024-2025)' },
  { numericId: 11936, toSlug: 'mathematiques', reason: 'Série Math 4AS SI (section SI = Math)' },

  // PHYSIQUE (1)
  { numericId: 14980, toSlug: 'physique', reason: 'Devoir Physique 4AS SI (2012-2013)' },
];

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const prisma = new PrismaClient();

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dryRun') !== 'false';
    const onlyIds = url.searchParams.get('ids')?.split(',').map(Number).filter(Boolean);
    const commit = url.searchParams.get('commit') === 'true';

    // 1. Lookup all target subjects
    const subjectSlugs = [...new Set(RECLASSIFICATIONS.map((r) => r.toSlug))];
    const targetSubjects = await prisma.subject.findMany({
      where: { slug: { in: subjectSlugs } },
    });
    const subBySlug = new Map(targetSubjects.map((s) => [s.slug, s]));

    const missing = subjectSlugs.filter((s) => !subBySlug.has(s));
    if (missing.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Subjects introuvables: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    // 2. Get source subject (informatique)
    const informatique = await prisma.subject.findUnique({ where: { slug: 'informatique' } });
    if (!informatique) {
      return NextResponse.json({ ok: false, error: 'Subject informatique introuvable' }, { status: 400 });
    }

    // 3. Filter
    const items = onlyIds
      ? RECLASSIFICATIONS.filter((r) => onlyIds.includes(r.numericId))
      : RECLASSIFICATIONS;

    const results: Array<{
      numericId: number;
      status: 'success' | 'skipped' | 'error' | 'would-reclassify';
      from: string;
      to: string;
      reason: string;
      title?: string;
    }> = [];

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const r of items) {
      const targetSubject = subBySlug.get(r.toSlug)!;
      const resource = await prisma.resource.findFirst({
        where: { numericId: r.numericId },
        select: { id: true, title: true, subjectId: true, slug: true },
      });

      if (!resource) {
        results.push({
          numericId: r.numericId,
          status: 'error',
          from: 'informatique',
          to: r.toSlug,
          reason: `Resource ${r.numericId} introuvable`,
        });
        errorCount++;
        continue;
      }

      // Already in the target subject?
      if (resource.subjectId === targetSubject.id) {
        results.push({
          numericId: r.numericId,
          status: 'skipped',
          from: r.toSlug,
          to: r.toSlug,
          reason: 'Déjà dans la matière cible',
          title: resource.title,
        });
        skippedCount++;
        continue;
      }

      // Not in informatique? (manual fix maybe)
      if (resource.subjectId !== informatique.id) {
        results.push({
          numericId: r.numericId,
          status: 'skipped',
          from: 'other',
          to: r.toSlug,
          reason: `Resource n'est pas en informatique (subjectId=${resource.subjectId})`,
          title: resource.title,
        });
        skippedCount++;
        continue;
      }

      if (dryRun || !commit) {
        results.push({
          numericId: r.numericId,
          status: 'would-reclassify',
          from: 'informatique',
          to: r.toSlug,
          reason: r.reason,
          title: resource.title,
        });
        successCount++;
        continue;
      }

      try {
        await prisma.resource.update({
          where: { id: resource.id },
          data: { subjectId: targetSubject.id },
        });

        // Revalidate the resource page
        try {
          revalidatePath(`/fr/ressources/${r.numericId}`);
          revalidatePath(`/ar/ressources/${r.numericId}`);
        } catch (e) {
          // ignore
        }

        results.push({
          numericId: r.numericId,
          status: 'success',
          from: 'informatique',
          to: r.toSlug,
          reason: r.reason,
          title: resource.title,
        });
        successCount++;
      } catch (e: any) {
        results.push({
          numericId: r.numericId,
          status: 'error',
          from: 'informatique',
          to: r.toSlug,
          reason: `Erreur update: ${e?.message || String(e)}`,
          title: resource.title,
        });
        errorCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      mode: dryRun ? 'dry-run' : commit ? 'commit' : 'preview',
      summary: {
        total: items.length,
        success: successCount,
        errors: errorCount,
        skipped: skippedCount,
      },
      byTarget: subjectSlugs.reduce((acc: Record<string, number>, slug) => {
        acc[slug] = items.filter((r) => r.toSlug === slug).length;
        return acc;
      }, {}),
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

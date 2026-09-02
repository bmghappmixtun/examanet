// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ============================================================================
// Reclassify misclassified English resources (2026-08-15)
// ============================================================================
// Bug: 9 fichiers uploadés comme "Anglais" mais dont le titre indique une AUTRE matière
// Source: détection par analyse du pattern "Type - SubjectName - ..." + AI summary
// ============================================================================

const RECLASSIFICATIONS: Array<{
  numericId: number;
  toSlug: string;
  reason: string;
  reasonAr?: string;
}> = [
  // CHIMIE → PHYSIQUE (chimie n'existe pas en DB, enseignée avec physique en Tunisie)
  { numericId: 7207, toSlug: 'physique', reason: 'Cours de Chimie (acides/bases) mal classé en Anglais' },

  // FRANÇAIS
  { numericId: 753, toSlug: 'francais', reason: 'Devoir de Français 8ème (titre arabe) mal classé' },
  { numericId: 4768, toSlug: 'francais', reason: 'Devoir de Français 1AS mal classé' },
  { numericId: 9684, toSlug: 'francais', reason: 'Devoir de Français 3AS mal classé' },

  // ÉDUCATION CIVIQUE
  { numericId: 8853, toSlug: 'education-civique', reason: 'Éducation civique 2AS mal classé' },
  { numericId: 8869, toSlug: 'education-civique', reason: 'Éducation civique 2AS mal classé (doublon)' },

  // ÉCONOMIE
  { numericId: 8101, toSlug: 'economie', reason: 'Économie 1AS mal classé' },
  { numericId: 9325, toSlug: 'economie', reason: 'Économie 4AS mal classé' },

  // MATHÉMATIQUES
  { numericId: 9681, toSlug: 'mathematiques', reason: 'Contrôle de mathématiques 1AS mal classé' },
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

    // 1. Lookup all target subjects once
    const subjectSlugs = [...new Set(RECLASSIFICATIONS.map((r) => r.toSlug))];
    const targetSubjects = await prisma.subject.findMany({
      where: { slug: { in: subjectSlugs } },
    });
    const subBySlug = new Map(targetSubjects.map((s) => [s.slug, s]));

    const missing = subjectSlugs.filter((s) => !subBySlug.has(s));
    if (missing.length > 0) {
      return NextResponse.json({ ok: false, error: `Subjects introuvables: ${missing.join(', ')}` }, { status: 400 });
    }

    // 2. Get anglais subject (source)
    const anglais = await prisma.subject.findUnique({ where: { slug: 'anglais' } });
    if (!anglais) {
      return NextResponse.json({ ok: false, error: 'Subject anglais introuvable' }, { status: 400 });
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
      title: string;
      reason: string;
      error?: string;
    }> = [];

    for (const r of items) {
      const resource = await prisma.resource.findFirst({
        where: { numericId: r.numericId },
        include: { subject: { select: { nameFr: true, slug: true } } },
      });

      if (!resource) {
        results.push({
          numericId: r.numericId,
          status: 'error',
          from: '?',
          to: r.toSlug,
          title: '(introuvable)',
          reason: r.reason,
          error: 'Resource introuvable',
        });
        continue;
      }

      const targetSub = subBySlug.get(r.toSlug)!;

      if (resource.subject.slug === r.toSlug) {
        results.push({
          numericId: r.numericId,
          status: 'skipped',
          from: resource.subject.nameFr,
          to: targetSub.nameFr,
          title: resource.title,
          reason: r.reason + ' (déjà dans le bon subject)',
        });
        continue;
      }

      if (dryRun) {
        results.push({
          numericId: r.numericId,
          status: 'would-reclassify',
          from: resource.subject.nameFr,
          to: targetSub.nameFr,
          title: resource.title,
          reason: r.reason,
        });
        continue;
      }

      // 4. Real reclassification
      try {
        await prisma.resource.update({
          where: { id: resource.id },
          data: {
            subjectId: targetSub.id,
            // Clear eco-specific metadata if not eco anymore
            ...(r.toSlug !== 'economie' && r.toSlug !== 'gestion'
              ? {}
              : {}),
          },
        });

        // 5. Revalidate public page
        try {
          revalidatePath(`/fr/ressources/${r.numericId}/${resource.slug}-${r.numericId}`);
          revalidatePath('/fr/ressources');
        } catch {
          // ignore
        }

        results.push({
          numericId: r.numericId,
          status: 'success',
          from: resource.subject.nameFr,
          to: targetSub.nameFr,
          title: resource.title,
          reason: r.reason,
        });
      } catch (e) {
        results.push({
          numericId: r.numericId,
          status: 'error',
          from: resource.subject.nameFr,
          to: targetSub.nameFr,
          title: resource.title,
          reason: r.reason,
          error: String(e),
        });
      }
    }

    // Summary
    const summary = {
      total: items.length,
      success: results.filter((r) => r.status === 'success').length,
      wouldReclassify: results.filter((r) => r.status === 'would-reclassify').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
    };

    return NextResponse.json({
      ok: true,
      dryRun,
      summary,
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

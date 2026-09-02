import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { properSlugify } from '@/lib/slugify';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SEED_TOKEN = process.env.SEED_TOKEN || '';

// ============================================================================
// Fix ANGLAIS LYCÉE titles — Append generalSubject after ":"
// ============================================================================
// Examanet title format:
//   "Type N°X - Matière - Classe - Section X - TrimX - (year) : {Topic}"
//
// 93% of anglais lycée files (250/270) are missing the ": {Topic}" part.
// This endpoint appends the generalSubject to those titles.
// ============================================================================

const MAX_TITLE_LENGTH = 200; // Hard cap for title length

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const prisma = new PrismaClient();
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const onlyIds = body.ids
      ? (Array.isArray(body.ids) ? body.ids : String(body.ids).split(',').map(Number)).filter(Boolean)
      : undefined;

    // Get all anglais lycée files
    const anglais = await prisma.subject.findUnique({ where: { slug: 'anglais' } });
    if (!anglais) {
      return NextResponse.json({ ok: false, error: 'Subject anglais introuvable' }, { status: 400 });
    }
    const classes = await prisma.class.findMany({
      where: { slug: { in: ['1ere-secondaire', '2eme-secondaire', '3eme-secondaire', '4eme-secondaire'] } },
    });

    const whereClause: any = {
      subjectId: anglais.id,
      classId: { in: classes.map((c) => c.id) },
    };
    if (onlyIds && onlyIds.length > 0) {
      whereClause.numericId = { in: onlyIds };
    }

    const files = await prisma.resource.findMany({
      where: whereClause,
      include: {
        class: { select: { nameFr: true, slug: true } },
        metadata: { select: { generalSubject: true } },
      },
      orderBy: { numericId: 'asc' },
    });

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const results: any[] = [];

    for (const f of files) {
      const oldTitle = f.title;
      const hasColon = oldTitle.includes(':');
      const gs = f.metadata?.generalSubject;

      // Skip if no GS available (can't append)
      if (!gs) {
        skipped++;
        results.push({
          numericId: f.numericId,
          status: 'skipped',
          reason: 'no generalSubject available',
          title: oldTitle,
        });
        continue;
      }

      // Determine new title
      let newTitle: string;
      if (hasColon) {
        // Already has a topic — check if it matches current GS, else update
        const parts = oldTitle.split(':');
        const currentTopic = (parts[parts.length - 1] || '').trim();
        // Only update if the topic is very different (heuristic: length differs a lot)
        if (Math.abs(currentTopic.length - gs.length) < 10) {
          skipped++;
          results.push({
            numericId: f.numericId,
            status: 'skipped',
            reason: 'already has topic',
            title: oldTitle,
          });
          continue;
        }
        // Replace the topic after ":"
        newTitle = oldTitle.split(':').slice(0, -1).join(':').trim() + ' : ' + gs;
      } else {
        // Append ": {gs}"
        newTitle = oldTitle.trim() + ' : ' + gs;
      }

      // Truncate if too long
      if (newTitle.length > MAX_TITLE_LENGTH) {
        // Try to truncate the topic part
        const basePart = newTitle.split(':').slice(0, -1).join(':').trim();
        const maxTopicLen = MAX_TITLE_LENGTH - basePart.length - 3; // " : " = 3 chars
        if (maxTopicLen > 20) {
          const truncatedTopic = gs.length > maxTopicLen
            ? gs.substring(0, maxTopicLen - 1).trim() + '…'
            : gs;
          newTitle = basePart + ' : ' + truncatedTopic;
        } else {
          // Base title is too long, just truncate at MAX_TITLE_LENGTH
          newTitle = newTitle.substring(0, MAX_TITLE_LENGTH - 1).trim() + '…';
        }
      }

      // Generate new slug
      const newSlug = properSlugify(newTitle, 80);

      // Save
      try {
        if (!dryRun) {
          await prisma.resource.update({
            where: { id: f.id },
            data: {
              title: newTitle,
              slug: newSlug,
            },
          });

          // Revalidate the resource page
          try {
            revalidatePath(`/fr/ressources/${f.numericId}/${f.slug}-${f.numericId}`);
            revalidatePath(`/ar/ressources/${f.numericId}/${f.slug}-${f.numericId}`);
            revalidatePath(`/fr/ressources`);
            revalidatePath(`/ar/ressources`);
          } catch {
            // ignore
          }
        }

        updated++;
        results.push({
          numericId: f.numericId,
          status: 'updated',
          oldTitle,
          newTitle,
          newSlug,
        });
      } catch (e) {
        errors++;
        results.push({
          numericId: f.numericId,
          status: 'error',
          error: String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      summary: {
        total: files.length,
        updated,
        skipped,
        errors,
      },
      results: results.slice(0, 50),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const SEED_TOKEN = process.env.SEED_TOKEN || '';

// Class short names
const CLASS_SHORT: Record<string, string> = {
  '1ere-secondaire': '1AS',
  '2eme-secondaire': '2AS',
  '3eme-secondaire': '3AS',
  '4eme-secondaire': '4AS',
};

// Section short names (Examanet convention)
const SECTION_SHORT: Record<string, string> = {
  'sciences': 'Sciences',
  'sciences-experimentales': 'Sciences Expérimentales',
  'maths': 'Mathématiques',
  'lettres': 'Lettres',
  'technique': 'Technique',
  'eco-gestion': 'Économie-Gestion',
  'eco-services': 'Économie et Services',
  'sport': 'Sport',
  'technologies-informatique': 'Technologies de l\'Informatique',
};

function extractNumero(title: string): number {
  const m = title.match(/N°\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // Fallback: DC N°X or DS N°X
  const m2 = title.match(/\bDC\s*(\d+)/i);
  if (m2) return parseInt(m2[1], 10);
  const m3 = title.match(/\bDS\s*(\d+)/i);
  if (m3) return parseInt(m3[1], 10);
  return 1;
}

function detectType(title: string, currentType: string): { kind: string; subtype?: string; label: string } {
  const lower = title.toLowerCase();
  if (currentType === 'COURSE' || lower.includes('cours')) {
    return { kind: 'COURSE', label: 'Cours' };
  }
  if (lower.includes('série') || lower.includes('serie') || currentType === 'EXERCISE') {
    return { kind: 'EXERCISE', label: "Série d'exercices" };
  }
  if (lower.includes('synthèse') || lower.includes('synthese')) {
    return { kind: 'DEVOIR', subtype: 'SYNTHESIS', label: 'Devoir de Synthèse' };
  }
  if (lower.includes('maison')) {
    return { kind: 'DEVOIR', subtype: 'HOUSEWORK', label: 'Devoir de Maison' };
  }
  if (lower.includes('contrôle') || lower.includes('controle') || lower.includes('revision')) {
    return { kind: 'DEVOIR', subtype: 'CONTROL', label: 'Devoir de Contrôle' };
  }
  return { kind: 'DEVOIR', subtype: 'CONTROL', label: 'Devoir de Contrôle' };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

function buildNewTitle(r: {
  title: string;
  type: string;
  year: string | null;
  generalSubject: string | null;
  classSlug: string;
  className: string | null;
  sectionSlug: string | null;
  sectionName: string | null;
  schoolType: string | null;
  hasCorrection: boolean;
}): string | null {
  const { title, generalSubject, classSlug, className, sectionSlug, sectionName, schoolType, hasCorrection } = r;
  if (!generalSubject) return null;

  const typeInfo = detectType(title, r.type);
  const numero = extractNumero(title);
  const classShort = CLASS_SHORT[classSlug] || className || classSlug;
  const sectionShort = sectionSlug && sectionSlug !== 'none' ? (SECTION_SHORT[sectionSlug] || sectionName || sectionSlug) : '';

  let baseTitle: string;
  if (typeInfo.kind === 'COURSE') {
    const sectionPart = sectionShort ? ` - Section ${sectionShort}` : '';
    baseTitle = `Cours - SVT: ${generalSubject} - ${classShort}${sectionPart} (${r.year})`;
  } else if (typeInfo.kind === 'EXERCISE') {
    const sectionPart = sectionShort ? ` - Section ${sectionShort}` : '';
    baseTitle = `Série d'exercices - SVT: ${generalSubject} - ${classShort}${sectionPart} (${r.year})`;
  } else {
    const sectionPart = sectionShort ? ` - Section ${sectionShort}` : '';
    baseTitle = `${typeInfo.label} N°${numero} - SVT: ${generalSubject} - ${classShort}${sectionPart} (${r.year})`;
  }

  const tags: string[] = [];
  if (schoolType === 'PILOTE') tags.push('[Lycée Pilote]');
  if (hasCorrection) tags.push('(avec corrigé)');
  if (tags.length > 0) baseTitle += ' ' + tags.join(' ');

  return baseTitle;
}

function buildNewSlug(newTitle: string, numericId: number | null): string {
  let slug = slugify(newTitle);
  slug = numericId ? `${slug}-${numericId}` : slug;
  if (slug.length > 240) slug = slug.slice(0, 240);
  return slug;
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 50;
    const startIndex = body.startIndex || 0;
    const dryRun = body.dryRun === true;
    const updateSlugs = body.updateSlugs !== false; // default true

    // All SVT lycée files with generalSubject in metadata
    const allFiles: any[] = await prisma.resource.findMany({
      where: {
        class: { level: { slug: 'lycee' } },
        subject: { slug: 'svt' },
        status: 'PUBLISHED',
      },
      include: {
        metadata: { select: { generalSubject: true } },
        class: { select: { slug: true, nameFr: true } },
        section: { select: { slug: true, nameFr: true } },
      },
      orderBy: { numericId: 'asc' },
    });

    const changes: any[] = [];
    let updated = 0, unchanged = 0, errors = 0, skipped = 0;

    for (const r of allFiles) {
      const newTitle = buildNewTitle({
        title: r.title,
        type: r.type,
        year: r.year,
        generalSubject: r.metadata?.generalSubject,
        classSlug: r.class?.slug || '',
        className: r.class?.nameFr,
        sectionSlug: r.section?.slug,
        sectionName: r.section?.nameFr,
        schoolType: r.schoolType,
        hasCorrection: r.hasCorrection,
      });

      if (!newTitle) {
        skipped++;
        continue;
      }

      const newSlug = buildNewSlug(newTitle, r.numericId);
      const titleChanged = r.title !== newTitle;
      const slugChanged = updateSlugs && r.slug !== newSlug;

      if (!titleChanged && !slugChanged) {
        unchanged++;
        continue;
      }

      try {
        if (!dryRun) {
          await prisma.resource.update({
            where: { numericId: r.numericId },
            data: {
              title: newTitle,
              ...(slugChanged ? { slug: newSlug } : {}),
            },
          });
          // Revalidate both old and new slugs
          revalidatePath(`/ressources/${r.numericId}/${r.slug}`);
          revalidatePath(`/fr/ressources/${r.numericId}/${r.slug}`);
          revalidatePath(`/ar/ressources/${r.numericId}/${r.slug}`);
          revalidatePath(`/ressources/${r.numericId}/${newSlug}`);
          revalidatePath(`/fr/ressources/${r.numericId}/${newSlug}`);
          revalidatePath(`/ar/ressources/${r.numericId}/${newSlug}`);
        }
        changes.push({
          numericId: r.numericId,
          oldTitle: r.title.substring(0, 60),
          newTitle: newTitle.substring(0, 60),
          slugChanged,
        });
        updated++;
      } catch (e: any) {
        errors++;
        changes.push({ numericId: r.numericId, status: 'error', error: e.message });
      }
    }

    const total = allFiles.length;
    const chunk = allFiles.slice(startIndex, startIndex + batchSize);

    return NextResponse.json({
      success: true,
      dryRun,
      updateSlugs,
      total,
      updated,
      unchanged,
      skipped,
      errors,
      sampleChanges: changes.slice(0, 20),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}

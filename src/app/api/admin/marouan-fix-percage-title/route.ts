import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Update #15458: "Unité de Perçage" → "Unité Automatique de Perçage"
    const oldTitle = "Devoir de Contrôle N°2 - Technologie: Unité de Perçage - 3AS - Section Technique (2014-2015)";
    const newTitle = "Devoir de Contrôle N°2 - Technologie: Unité Automatique de Perçage - 3AS - Section Technique (2014-2015)";

    // Build new slug from new title
    const slugBase = newTitle
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['']/g, '')
      .replace(/['']/g, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 200);
    const newSlug = `${slugBase}-15458`;

    const resource = await prisma.resource.findUnique({ where: { numericId: 15458 } });
    if (!resource) {
      return NextResponse.json({ error: 'Resource #15458 not found' }, { status: 404 });
    }

    const oldSlug = resource.slug;
    const updated = await prisma.resource.update({
      where: { numericId: 15458 },
      data: { title: newTitle, slug: newSlug },
      select: { id: true, numericId: true, title: true, slug: true },
    });

    // Revalidate both old and new URLs (for SEO redirect)
    revalidatePath(`/ressources/15458/${oldSlug}`);
    revalidatePath(`/fr/ressources/15458/${oldSlug}`);
    revalidatePath(`/ar/ressources/15458/${oldSlug}`);
    revalidatePath(`/ressources/15458/${newSlug}`);
    revalidatePath(`/fr/ressources/15458/${newSlug}`);
    revalidatePath(`/ar/ressources/15458/${newSlug}`);

    return NextResponse.json({
      success: true,
      oldTitle: resource.title,
      newTitle,
      oldSlug,
      newSlug,
      resource: updated,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

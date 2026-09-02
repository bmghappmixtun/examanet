import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ||
                req.nextUrl.searchParams.get('token');
  if (token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const updates = body.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'updates array required' }, { status: 400 });
    }

    const results = [];
    for (const u of updates) {
      const resource = await prisma.resource.findUnique({ where: { numericId: u.numericId } });
      if (!resource) {
        results.push({ numericId: u.numericId, status: 'not_found' });
        continue;
      }

      const data = {
        fileKey: u.fileKey,
        fileUrl: u.fileUrl,
        fileSize: u.fileSize,
        pageCount: u.pageCount,
      };

      const updated = await prisma.resource.update({
        where: { numericId: u.numericId },
        data,
        select: { id: true, numericId: true, title: true, fileKey: true, fileSize: true, pageCount: true, slug: true },
      });
      
      // Revalidate the page cache
      revalidatePath(`/ressources/${u.numericId}/${updated.slug}`);
      revalidatePath(`/fr/ressources/${u.numericId}/${updated.slug}`);
      revalidatePath(`/ar/ressources/${u.numericId}/${updated.slug}`);
      
      results.push({ numericId: u.numericId, status: 'updated', resource: updated });
    }

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

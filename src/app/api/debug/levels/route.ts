import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx as any).env.DB;
    
    // Direct D1 query
    const levelsRaw = await db.prepare('SELECT * FROM "Level"').all();
    const classesRaw = await db.prepare('SELECT * FROM "Class" LIMIT 20').all();
    const sectionsRaw = await db.prepare('SELECT * FROM "Section" LIMIT 20').all();
    
    // Prisma-compat query
    const levelsPrisma = await prisma.level.findMany({
      orderBy: { order: 'asc' },
    });
    
    let prismaWithClasses: any = null;
    let prismaError: string | null = null;
    try {
      prismaWithClasses = await prisma.level.findMany({
        orderBy: { order: 'asc' },
        include: {
          classes: {
            orderBy: { order: 'asc' },
            include: {
              _count: { select: { resources: { where: { status: 'PUBLISHED' as any } } } },
            },
          },
        },
      });
    } catch (e: any) {
      prismaError = e.message;
    }
    
    return NextResponse.json({
      d1: {
        levelCount: levelsRaw.results?.length || 0,
        classCount: classesRaw.results?.length || 0,
        sectionCount: sectionsRaw.results?.length || 0,
        levels: levelsRaw.results,
        firstClass: classesRaw.results?.[0],
        firstSection: sectionsRaw.results?.[0],
      },
      prisma: {
        levelCount: levelsPrisma.length,
        firstLevel: levelsPrisma[0],
        withClasses: prismaWithClasses ? 'OK' : 'FAIL',
        withClassesError: prismaError,
        sampleWithClasses: prismaWithClasses?.[0],
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 800) }, { status: 500 });
  }
}

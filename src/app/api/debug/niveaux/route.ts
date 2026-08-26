import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Test 1: Just levels
    const test1 = await prisma.level.findMany({ orderBy: { order: 'asc' } });
    
    // Test 2: Levels with classes
    const test2 = await prisma.level.findMany({
      orderBy: { order: 'asc' },
      include: {
        classes: { orderBy: { order: 'asc' } },
      },
    });
    
    // Test 3: With _count
    let test3: any = null, test3Error: string | null = null;
    try {
      test3 = await prisma.level.findMany({
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
      test3Error = e.message + '\n' + (e.stack?.slice(0, 500) || '');
    }
    
    // Test 4: With sections
    let test4: any = null, test4Error: string | null = null;
    try {
      test4 = await prisma.level.findMany({
        orderBy: { order: 'asc' },
        include: {
          classes: {
            orderBy: { order: 'asc' },
            include: {
              sections: { orderBy: { nameFr: 'asc' }, take: 3 },
              _count: { select: { resources: { where: { status: 'PUBLISHED' as any } } } },
            },
          },
        },
      });
    } catch (e: any) {
      test4Error = e.message + '\n' + (e.stack?.slice(0, 500) || '');
    }
    
    return NextResponse.json({
      test1_levels: test1.length,
      test2_with_classes: test2.length,
      test2_first_class_count: test2[0]?.classes?.length,
      test3_with_count: test3 ? 'OK' : 'FAIL',
      test3Error,
      test3_class_count: test3?.[0]?.classes?.length,
      test4_with_sections: test4 ? 'OK' : 'FAIL',
      test4Error,
      test4_first_class: test4?.[0]?.classes?.[0] ? {
        slug: test4[0].classes[0].slug,
        sections: test4[0].classes[0].sections.length,
        _count: test4[0].classes[0]._count,
      } : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, stack: e.stack?.slice(0, 1000) }, { status: 500 });
  }
}

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/logs/[id]/resolve
 * 
 * Mark a VercelLog as reviewed (we don't have a resolved field on VercelLog).
 * For ErrorLog, we use the `resolved` field.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  try {
    // Try VercelLog first
    const vercel = await prisma.$queryRaw<any[]>`
      UPDATE "VercelLog" 
      SET reviewed = true, "reviewedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${id}
      RETURNING id
    `;
    
    if (vercel.length > 0) {
      return NextResponse.json({ ok: true, type: 'vercellog', id });
    }
    
    // Try ErrorLog
    const errorLog = await prisma.errorLog.update({
      where: { id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        // resolvedBy: 'admin',  // could be the admin user ID
      },
    }).catch(() => null);
    
    if (errorLog) {
      return NextResponse.json({ ok: true, type: 'errorlog', id });
    }
    
    return NextResponse.json({ 
      error: 'Not found',
      id,
    }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ 
      error: 'Update failed',
      detail: (e as Error).message,
    }, { status: 500 });
  }
}

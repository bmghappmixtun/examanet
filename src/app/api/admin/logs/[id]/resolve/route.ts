// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/d1-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/logs/[id]/resolve
 * 
 * Mark a CloudflareLog as reviewed (we don't have a resolved field on CloudflareLog).
 * For ErrorLog, we use the `resolved` field.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  try {
    // Try CloudflareLog first
    const vercel = await db.$queryRaw<any[]>`
      UPDATE "CloudflareLog" 
      SET reviewed = true, "reviewedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${id}
      RETURNING id
    `;
    
    if (vercel.length > 0) {
      return NextResponse.json({ ok: true, type: 'cloudflarelog', id });
    }
    
    // Try ErrorLog
    const errorLog = await db.errorLog.update({
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

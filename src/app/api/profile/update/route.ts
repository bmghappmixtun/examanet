// @ts-nocheck
/**
 * PATCH /api/profile/update
 * 
 * 2026-09-09: Update current user's profile (used after OAuth signup
 * to complete missing fields like school/class/governorate).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isValidOrigin, isProduction, getClientIp } from '@/lib/security';
import { getCurrentUser } from '@/lib/auth';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

export async function PATCH(req: NextRequest) {
  if (isProduction() && !isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const allowedFields = ['firstName', 'lastName', 'schoolLevel', 'classLevel', 'schoolName', 'governorate'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
        // Basic validation
        const v = String(body[field]).trim().slice(0, 200);
        if (!v) continue;
        updates.push(`${field} = ?`);
        values.push(v);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
    }

    updates.push('updatedAt = ?');
    values.push(Date.now());
    values.push(user.id);

    const db = await getD1();
    await db.prepare(
      `UPDATE User SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[profile/update] error:', e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

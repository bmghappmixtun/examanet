// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run } from '@/lib/db-d1';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env.DB;
}

// GET /api/user/account - full account info (D1 direct)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const account = await d1First(
      `SELECT id, email, role, status, firstName, lastName, avatarUrl, bio,
              schoolName, governorate, diploma, teachingSubjects, teachingLevels,
              phone, website, preferredLang, themePref, notifyEmail, notifyInApp,
              createdAt, lastLoginAt, emailVerifiedAt
       FROM User WHERE id = ?`,
      user.id,
    );
    if (!account) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    return NextResponse.json({ account });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/user/account - update account (D1 direct)
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const allowed = [
      'firstName',
      'lastName',
      'avatarUrl',
      'bio',
      'schoolName',
      'governorate',
      'diploma',
      'phone',
      'website',
      'preferredLang',
      'themePref',
      'notifyEmail',
      'notifyInApp',
    ];
    const sets: string[] = [];
    const params: any[] = [];

    for (const k of allowed) {
      if (body[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(body[k]);
      }
    }

    // JSON fields
    const jsonStringify = (v: any): string => {
      if (Array.isArray(v)) return JSON.stringify(v);
      if (typeof v === 'string') {
        try { return JSON.stringify(JSON.parse(v)); } catch { return JSON.stringify(v.split(',').map(s => s.trim()).filter(Boolean)); }
      }
      return JSON.stringify(v);
    };
    if (body.teachingSubjects !== undefined) {
      sets.push('teachingSubjects = ?');
      params.push(jsonStringify(body.teachingSubjects));
    }
    if (body.teachingLevels !== undefined) {
      sets.push('teachingLevels = ?');
      params.push(jsonStringify(body.teachingLevels));
    }

    if (sets.length === 0) {
      return NextResponse.json({ success: true, account: null });
    }

    params.push(user.id);
    await d1Run(
      `UPDATE User SET ${sets.join(', ')} WHERE id = ?`,
      ...params,
    );

    const updated = await d1First(
      `SELECT id, firstName, lastName, avatarUrl, bio, schoolName, governorate,
              diploma, teachingSubjects, teachingLevels, phone, website,
              preferredLang, themePref, notifyEmail, notifyInApp
       FROM User WHERE id = ?`,
      user.id,
    );
    return NextResponse.json({ success: true, account: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/user/account - delete account
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Les admins ne peuvent pas supprimer leur compte ici' },
        { status: 403 },
      );
    }

    await d1Run('DELETE FROM User WHERE id = ?', user.id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

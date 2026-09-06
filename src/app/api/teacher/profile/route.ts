// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getD1() {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const ctx = await getCloudflareContext({ async: true });
  return (ctx as any).env?.DB;
}

// Fields the teacher can edit on their own profile (admin can edit more via /admin/utilisateurs)
const EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'firstNameAr',
  'lastNameAr',
  'bio',
  'schoolName',
  'schoolNameAr',
  'governorate',
  'diploma',
  'phone',
  'website',
  'teachingSubjects',
  'teachingLevels',
  'avatarUrl',
] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });
  }

  const db = await getD1();
  if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

  const profile: any = await db.prepare(`
    SELECT id, firstName, lastName, firstNameAr, lastNameAr, email, bio,
           schoolName, schoolNameAr, governorate, diploma, phone, website,
           teachingSubjects, teachingLevels, avatarUrl, slug, numericId,
           isVerifiedTeacher, uploadsCount, followersCount, createdAt
    FROM User WHERE id = ?
  `).bind(user.id).first();

  if (!profile) return NextResponse.json({ error: 'Profil non trouvé' }, { status: 404 });

  return NextResponse.json(profile);
}

/**
 * PATCH /api/teacher/profile
 * Update the teacher's own profile (firstName, lastName, bio, school, etc.)
 *
 * 2026-09-06: Added — the form on /enseignant/profil was calling PATCH but
 * no handler existed, so the catch block showed "Erreur réseau" and the
 * profile never saved.
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });
  }

  const db = await getD1();
  if (!db) return NextResponse.json({ error: 'DB not available' }, { status: 503 });

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  // Build the SET clause dynamically from editable fields
  const updates: string[] = [];
  const values: any[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      let v = body[field];
      // Stringify JSON arrays (teachingSubjects, teachingLevels)
      if ((field === 'teachingSubjects' || field === 'teachingLevels') && Array.isArray(v)) {
        v = JSON.stringify(v);
      }
      // Truncate long fields
      if (typeof v === 'string') {
        if (v.length > 200 && field !== 'bio') v = v.slice(0, 200);
        if (field === 'bio' && v.length > 1000) v = v.slice(0, 1000);
        // Sanitize avatarUrl: must be http(s) or empty
        if (field === 'avatarUrl' && v && !/^https?:\/\//.test(v)) {
          v = '';
        }
      }
      updates.push(`"${field}" = ?`);
      values.push(v ?? null);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
  }

  // updatedAt is unix ms
  updates.push('updatedAt = ?');
  values.push(Date.now());
  values.push(user.id); // WHERE id = ?

  const r = await db
    .prepare(`UPDATE User SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  if (!r.success) {
    return NextResponse.json({ error: r.error || 'Update failed' }, { status: 500 });
  }

  // Invalidate any cached profile views
  try {
    const { invalidateCache } = await import('@/lib/kv-cache');
    if (user.slug) {
      await invalidateCache(`teacher-detail-v1-${user.slug}`);
      await invalidateCache(`teacher-profile-v1-${user.id}`);
    }
  } catch {
    // Best effort
  }

  // Return the updated profile
  const updated: any = await db
    .prepare(
      `SELECT id, firstName, lastName, firstNameAr, lastNameAr, email, bio,
              schoolName, schoolNameAr, governorate, diploma, phone, website,
              teachingSubjects, teachingLevels, avatarUrl, slug, numericId,
              isVerifiedTeacher, uploadsCount, followersCount, createdAt
       FROM User WHERE id = ?`,
    )
    .bind(user.id)
    .first();

  return NextResponse.json({ success: true, profile: updated });
}

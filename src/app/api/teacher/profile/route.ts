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

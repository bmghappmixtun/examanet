// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';

export const maxDuration = 60;

/**
 * GET /api/teacher/resources/[id]
 * Get a single resource owned by the current teacher.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });
    }

    const { id } = await params;
    const resource = await d1First(
      `SELECT r.*, s.slug AS subjectSlug, s.nameFr AS subjectNameFr, s.color AS subjectColor,
              c.slug AS classSlug, c.nameFr AS classNameFr,
              sec.slug AS sectionSlug, sec.nameFr AS sectionNameFr
       FROM Resource r
       LEFT JOIN Subject s ON r.subjectId = s.id
       LEFT JOIN "Class" c ON r.classId = c.id
       LEFT JOIN Section sec ON r.sectionId = sec.id
       WHERE r.id = ?`,
      id,
    );
    if (!resource) return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
    if (user.role !== 'ADMIN' && resource.teacherId !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    return NextResponse.json({ resource });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * DELETE /api/teacher/resources/[id]
 * Delete a resource (only owner / admin).
 * D1 implementation: also clear library file's resourceId if linked.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });
    }

    const { id } = await params;
    const resource = await d1First('SELECT teacherId FROM Resource WHERE id = ?', id);
    if (!resource) return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
    if (user.role !== 'ADMIN' && resource.teacherId !== user.id) {
      return NextResponse.json({ error: 'Vous n\'êtes pas le propriétaire' }, { status: 403 });
    }

    // Unlink library file
    await d1Run('UPDATE TeacherFile SET resourceId = NULL, updatedAt = ? WHERE resourceId = ?', Date.now(), id);

    // Delete resource
    await d1Run('DELETE FROM Resource WHERE id = ?', id);

    return NextResponse.json({ success: true, message: 'Ressource supprimée' });
  } catch (e: any) {
    console.error('DELETE resource error:', e);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

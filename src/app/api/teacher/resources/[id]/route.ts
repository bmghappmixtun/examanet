// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

export const maxDuration = 60;

/**
 * PATCH /api/teacher/resources/[id]
 * Edit a resource owned by the current teacher.
 * 2026-09-04: Added — previously no PATCH handler existed so teachers couldn't
 * edit their resources after creation. Only the metadata fields (no file swap).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isValidOrigin && !isValidOrigin(req)) {
      return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
    }

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Réservé aux enseignants' }, { status: 403 });
    }

    const { id } = await params;
    const resource = await d1First(
      'SELECT id, teacherId, status, slug, numericId FROM Resource WHERE id = ?',
      id,
    );
    if (!resource) return NextResponse.json({ error: 'Ressource introuvable' }, { status: 404 });
    if (user.role !== 'ADMIN' && resource.teacherId !== user.id) {
      return NextResponse.json({ error: 'Vous n\'êtes pas le propriétaire' }, { status: 403 });
    }

    // Only allow editing PENDING_APPROVAL or REJECTED resources (admin can edit anything)
    // Once PUBLISHED, content changes go through the admin edit approval flow
    if (user.role !== 'ADMIN' && resource.status !== 'PENDING_APPROVAL' && resource.status !== 'REJECTED') {
      return NextResponse.json(
        { error: `Impossible de modifier une ressource ${resource.status} (contactez un admin)` },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const allowedFields: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      summary: 'summary',
      type: 'type',
      year: 'year',
      trimester: 'trimester',
      language: 'language',
      tags: 'tags',
      homeworkSubtype: 'homeworkSubtype',
      homeworkNumber: 'homeworkNumber',
      schoolType: 'schoolType',
      product: 'product',
      hasCorrection: 'hasCorrection',
    };
    for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
      if (bodyKey in body) {
        const v = body[bodyKey];
        if (v === null || v === undefined) continue;
        // Coerce hasCorrection to 0/1
        if (bodyKey === 'hasCorrection') {
          allowedFields[dbCol] = v ? 1 : 0;
        } else {
          allowedFields[dbCol] = String(v).slice(0, 1000);
        }
      }
    }

    // Resolve subject/class/section slugs → IDs
    if ('subject' in body) {
      const slug = body.subject;
      if (slug) {
        const r: any = await d1First('SELECT id FROM Subject WHERE slug = ?', String(slug));
        if (!r) return NextResponse.json({ error: 'Matière invalide' }, { status: 400 });
        allowedFields.subjectId = r.id;
      }
    }
    if ('class' in body) {
      const slug = body.class;
      if (slug) {
        const r: any = await d1First('SELECT id FROM "Class" WHERE slug = ?', String(slug));
        if (!r) return NextResponse.json({ error: 'Classe invalide' }, { status: 400 });
        allowedFields.classId = r.id;
      }
    }
    if ('section' in body) {
      const slug = body.section;
      if (slug) {
        const r: any = await d1First('SELECT id FROM Section WHERE slug = ?', String(slug));
        if (r) allowedFields.sectionId = r.id;
      }
    }

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 });
    }

    // Bump updatedAt
    allowedFields.updatedAt = Date.now();

    // If status was REJECTED, reset to PENDING_APPROVAL so it re-enters the review flow
    if (user.role !== 'ADMIN' && resource.status === 'REJECTED') {
      allowedFields.status = 'PENDING_APPROVAL';
      allowedFields.rejectionReason = null;
      allowedFields.rejectionAt = null;
    }

    const setClause = Object.keys(allowedFields).map((k) => `${k} = ?`).join(', ');
    const values = Object.values(allowedFields);
    const r = await d1Run(
      `UPDATE Resource SET ${setClause} WHERE id = ?`,
      ...values,
      id,
    );
    if (!(r as any).success) {
      return NextResponse.json({ error: (r as any).error }, { status: 500 });
    }

    return NextResponse.json({ success: true, resource: { id, ...allowedFields } });
  } catch (e: any) {
    console.error('PATCH resource error:', e);
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}

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

// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * GET /api/teacher/files
 *   ?classId=&type=&format=&search=
 *   Lists the teacher's library files (D1 direct)
 *
 * DELETE /api/teacher/files?id=
 *   Deletes a library file (only if owner)
 *
 * 2026-08-30: Converted to D1.
 *  Note: D1 TeacherFile has fewer columns than Prisma schema
 *  (no classId/sectionId/subjectId/originalFormat/notes/tags).
 *  So filtering by classId/type/format is no-op; we keep the params
 *  for API compat but they don't filter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1Run } from '@/lib/db-d1';

/**
 * Extract a timestamp from a file key like
 * "teacher-library/{teacherId}/1786589609365-filename.pdf".
 * Returns ISO string or undefined.
 */
function extractTimestampFromKey(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  const m = /\/(\d{13,})-/.exec(key);
  if (m) {
    const ts = Number(m[1]);
    if (ts > 1_000_000_000_000) return new Date(ts).toISOString();
  }
  return undefined;
}

/**
 * Pick the best available timestamp for a file:
 * - createdAt (ms) if > 0
 * - else: extract from fileKey
 * - else: return null (caller decides)
 */
function resolveCreatedAt(f: any): string | null {
  if (typeof f.createdAt === 'number' && f.createdAt > 0) {
    return new Date(f.createdAt).toISOString();
  }
  return extractTimestampFromKey(f.fileKey) || null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim();

    let sql = `SELECT f.id, f.teacherId, f.resourceId, f.fileName, f.fileKey, f.fileUrl, f.r2Key, f.r2PdfKey,
                      f.fileSize, f.mimeType, f.isActive, f.createdAt, f.updatedAt,
                      r.id AS r_id, r.numericId AS r_numericId, r.slug AS r_slug,
                      r.status AS r_status, r.title AS r_title,
                      r.rejectionReason AS r_rejectionReason, r.rejectionAt AS r_rejectionAt
               FROM TeacherFile f
               LEFT JOIN Resource r ON f.resourceId = r.id
               WHERE f.teacherId = ? AND f.isActive = 1`;
    const params: any[] = [user.id];
    if (search) {
      sql += ' AND fileName LIKE ?';
      params.push(`%${search}%`);
    }
    sql += ' ORDER BY f.createdAt DESC LIMIT 200';

    const files = await d1All(sql, ...params);
    // Normalize: keep createdAt as ISO string (or null for missing timestamps)
    // Also derive originalFormat from filename/mime (same logic as SSR page)
    // so the client doesn't crash on `format.toUpperCase()` for undefined format.
    const normalized = (files || []).map((f: any) => {
      const resource = f.r_id
        ? {
            id: f.r_id,
            numericId: f.r_numericId ?? null,
            slug: f.r_slug ?? null,
            status: f.r_status,
            title: f.r_title,
            rejectionReason: f.r_rejectionReason ?? null,
            rejectionAt: f.r_rejectionAt ?? null,
          }
        : null;
      // Derive originalFormat (page.tsx does the same)
      let fmt = '';
      if (f.fileName) {
        const m = /\.([a-z0-9]+)$/i.exec(f.fileName);
        if (m) fmt = m[1].toLowerCase();
      }
      if (!fmt && f.mimeType) {
        const mt = String(f.mimeType).toLowerCase();
        if (mt.includes('pdf')) fmt = 'pdf';
        else if (mt.includes('word') || mt.includes('document')) fmt = 'docx';
        else if (mt.includes('opendocument')) fmt = 'odt';
      }
      return {
        ...f,
        isActive: Boolean(f.isActive),
        originalFormat: fmt || 'other',
        resource,
        createdAt: resolveCreatedAt(f),
        updatedAt: resolveCreatedAt(f),
      };
    });
    return NextResponse.json({ files: normalized });
  } catch (e: any) {
    console.error('[api/teacher/files] error:', e.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }
    // Verify ownership
    const owner = await d1All(
      'SELECT teacherId, fileKey, r2Key FROM TeacherFile WHERE id = ?',
      id,
    );
    if (!owner || owner.length === 0) {
      return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });
    }
    if (owner[0].teacherId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
    // TODO: actually delete the file from R2 storage
    // For now, just mark as inactive
    await d1Run('UPDATE TeacherFile SET isActive = 0 WHERE id = ?', id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[api/teacher/files DELETE] error:', e.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

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

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim();

    let sql = `SELECT id, teacherId, resourceId, fileName, fileKey, fileUrl, r2Key, r2PdfKey,
                      fileSize, mimeType, isActive, createdAt, updatedAt
               FROM TeacherFile
               WHERE teacherId = ?`;
    const params: any[] = [user.id];
    if (search) {
      sql += ' AND fileName LIKE ?';
      params.push(`%${search}%`);
    }
    sql += ' ORDER BY createdAt DESC LIMIT 200';

    const files = await d1All(sql, ...params);
    return NextResponse.json({ files });
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

// @ts-nocheck
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';
import { invalidateCache } from '@/lib/kv-cache';

/**
 * POST /api/admin/teachers/bulk-delete — D1 direct
 *
 * SAFETY:
 * - Admin cannot delete themselves
 * - Admin role is always preserved
 * - boutiti.mehdi@gmail.com is NEVER deleted (hard-coded protection)
 * - Resources are TRANSFERRED to the current admin by default unless keepFiles=false
 *
 * Body: { ids: string[], keepFiles?: boolean }
 * Response: { ok: true, deleted: string[], transferred: number, deletedFiles: number, errors: string[] }
 */
const PROTECTED_EMAILS = new Set([
  'boutiti.mehdi@gmail.com', // ⚠️ ADMIN — never delete
]);

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    const keepFiles = body.keepFiles !== false;
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Aucun utilisateur fourni' }, { status: 400 });
    }
    if (ids.includes(admin.id)) {
      return NextResponse.json({ error: 'Vous ne pouvez pas vous supprimer vous-même' }, { status: 403 });
    }
    const placeholders = ids.map(() => '?').join(',');
    const targets = await d1All(
      `SELECT id, email, role FROM User WHERE id IN (${placeholders})`,
      ...ids,
    );
    const errors: string[] = [];
    const deleted: string[] = [];
    let transferred = 0;
    let deletedFiles = 0;
    for (const t of targets) {
      if (t.email && PROTECTED_EMAILS.has(t.email)) {
        errors.push(`${t.email} : protégé (admin principal)`);
        continue;
      }
      if (t.role === 'ADMIN') {
        errors.push(`${t.email || t.id} : admin protégé`);
        continue;
      }
      if (t.id === admin.id) {
        errors.push(`${t.email} : c'est vous`);
        continue;
      }
      try {
        if (keepFiles) {
          // Transfer resources to admin
          const r = await d1Run(
            "UPDATE Resource SET teacherId = ?, updatedAt = ? WHERE teacherId = ?",
            admin.id, Date.now(), t.id,
          );
          if (r.success) transferred += Number((r.meta as any)?.changes || 0);
        } else {
          // Delete resources owned by this teacher
          const r = await d1Run('DELETE FROM Resource WHERE teacherId = ?', t.id);
          if (r.success) deletedFiles += Number((r.meta as any)?.changes || 0);
        }
        // Cascade: delete sessions, files, etc.
        await d1Run('DELETE FROM Session WHERE userId = ?', t.id);
        await d1Run('DELETE FROM TeacherFile WHERE teacherId = ?', t.id);
        await d1Run('DELETE FROM TeacherVerificationFile WHERE userId = ?', t.id);
        // Delete user
        const r = await d1Run('DELETE FROM User WHERE id = ?', t.id);
        if (r.success) deleted.push(t.id);
        else errors.push(`${t.email}: ${r.error}`);
      } catch (e: any) {
        errors.push(`${t.email}: ${e.message}`);
      }
    }
    // PERF 2026-09-02: bust user-count-* caches (count changed)
    await invalidateCache('user-counts-v1');
    return NextResponse.json({ ok: true, deleted, transferred, deletedFiles, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}

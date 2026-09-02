// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/users/bulk — D1 direct
 *
 * Perform a bulk action on multiple users at once.
 * Body: { userIds: string[], action: 'suspend'|'activate'|'verify'|'unverify'|'delete'|'ban' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { d1All, d1First, d1Run, genId } from '@/lib/db-d1';
import { isValidOrigin } from '@/lib/security';

const MAX_BATCH = 100;
const validActions = ['suspend', 'activate', 'verify', 'unverify', 'delete', 'ban'];

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }
  if (!isValidOrigin(req)) {
    return NextResponse.json({ error: 'Origine non autorisée' }, { status: 403 });
  }

  let body: { userIds?: string[]; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  const userIds = Array.isArray(body.userIds) ? body.userIds : [];
  const action = body.action;

  if (userIds.length === 0) {
    return NextResponse.json({ error: 'Aucun utilisateur sélectionné' }, { status: 400 });
  }
  if (userIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BATCH} utilisateurs par lot (reçu: ${userIds.length})` },
      { status: 400 },
    );
  }
  if (!action || !validActions.includes(action)) {
    return NextResponse.json(
      { error: `Action invalide. Attendu: ${validActions.join(', ')}` },
      { status: 400 },
    );
  }

  // Lookup all targets in a single query
  const placeholders = userIds.map(() => '?').join(',');
  const targets = await d1All(
    `SELECT id, role, status, isVerifiedTeacher, email, firstName, lastName
     FROM User WHERE id IN (${placeholders})`,
    ...userIds,
  );
  const foundIds = new Set(targets.map((t) => t.id));
  const missingIds = userIds.filter((id) => !foundIds.has(id));

  const adminTargets = targets.filter((t) => t.role === 'ADMIN');
  if (adminTargets.length > 0) {
    return NextResponse.json(
      {
        error: 'Action refusée',
        message: `${adminTargets.length} administrateur(s) dans la sélection. Action impossible sur les comptes admin.`,
        adminIds: adminTargets.map((a) => a.id),
      },
      { status: 403 },
    );
  }

  const results: { id: string; name: string; success: boolean; error?: string }[] = [];
  const selfIds: string[] = [];

  for (const target of targets) {
    if (target.id === admin.id) {
      selfIds.push(target.id);
      results.push({ id: target.id, name: target.email, success: false, error: 'Vous ne pouvez pas vous modifier vous-même' });
      continue;
    }
    const name = `${target.firstName || ''} ${target.lastName || ''}`.trim() || target.email;
    try {
      let r;
      switch (action) {
        case 'suspend':
          if (target.status === 'SUSPENDED') {
            results.push({ id: target.id, name, success: true, error: 'Déjà suspendu' });
            continue;
          }
          r = await d1Run("UPDATE User SET status = 'SUSPENDED' WHERE id = ?", target.id);
          break;
        case 'activate':
          if (target.status === 'ACTIVE') {
            results.push({ id: target.id, name, success: true, error: 'Déjà actif' });
            continue;
          }
          r = await d1Run("UPDATE User SET status = 'ACTIVE' WHERE id = ?", target.id);
          break;
        case 'verify':
          r = await d1Run('UPDATE User SET isVerifiedTeacher = 1 WHERE id = ?', target.id);
          break;
        case 'unverify':
          r = await d1Run('UPDATE User SET isVerifiedTeacher = 0 WHERE id = ?', target.id);
          break;
        case 'ban':
          r = await d1Run("UPDATE User SET status = 'BANNED' WHERE id = ?", target.id);
          break;
        case 'delete':
          r = await deleteUserAndCascade(target.id);
          break;
      }
      if (r && !r.success) {
        results.push({ id: target.id, name, success: false, error: r.error });
      } else {
        results.push({ id: target.id, name, success: true });
      }
    } catch (e: any) {
      results.push({ id: target.id, name: target.email, success: false, error: e.message });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  return NextResponse.json({
    success: failed === 0,
    action,
    total: userIds.length,
    succeeded,
    failed,
    missing: missingIds.length,
    results,
    selfBlocked: selfIds.length,
  });
}

async function deleteUserAndCascade(userId: string) {
  // Delete everything we can from D1 tables that reference the user
  // (View/Download/Comment/Rating/Favorite/Follow/Report/etc. don't exist in D1 yet)
  await d1Run('DELETE FROM Session WHERE userId = ?', userId);
  await d1Run('DELETE FROM TeacherFile WHERE teacherId = ?', userId);
  await d1Run('DELETE FROM TeacherVerificationFile WHERE userId = ?', userId);
  await d1Run("DELETE FROM Resource WHERE teacherId = ?", userId);
  return await d1Run('DELETE FROM User WHERE id = ?', userId);
}

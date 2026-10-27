// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { d1All } from '@/lib/db-d1';
import { getCurrentUser } from '@/lib/auth';
import { syncInvitationDeliveryStatus } from '@/lib/invitation';

/** Statuts d'invitation valides (mêmes clés que STATUS_META côté client). */
const VALID_STATUSES = ['PENDING', 'SENT', 'CLICKED', 'ACTIVATED', 'EXPIRED', 'CANCELLED'];

/**
 * POST /api/admin/invitations/sync-delivery
 *
 * Body optionnel :
 *   { invitationId }  → synchronise UNE invitation
 *   { status }        → synchronise UNIQUEMENT les invitations de cet onglet
 *                       (PENDING | SENT | CLICKED | ACTIVATED | EXPIRED | CANCELLED)
 *   (absent)          → comportement historique : toutes les invitations
 *                       envoyées non synchronisées ou dont la synchro a plus
 *                       de 30 jours (max 50 par lot).
 *
 * 2026-10-27 : le bouton « Sync Resend » de /admin/invitations ne synchronise
 * plus que l'onglet actif (demandé explicitement) — sinon on interrogeait
 * Resend pour toute la base alors qu'on regarde 17 invitations expirées.
 *
 * Sémantique alignée sur le filtre du tableau :
 *   - CLICKED → `clickCount > 0` (les profs qui ont cliqué, quel que soit
 *     leur statut actuel — pas `status = 'CLICKED'`, toujours 0).
 *   - autres  → `status = ?`.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me || me.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const invitationId = body?.invitationId;

    // If invitationId provided, sync just one
    if (invitationId) {
      const result = await syncInvitationDeliveryStatus(invitationId);
      return NextResponse.json(result);
    }

    const status = typeof body?.status === 'string' ? body.status.trim().toUpperCase() : '';
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Statut invalide : ${status}` },
        { status: 400 },
      );
    }

    let invitations;
    let matched = 0;

    if (status) {
      // ── Onglet actif uniquement ──────────────────────────────────────────
      // On reprend EXACTEMENT la sémantique du filtre du tableau, et on ne
      // filtre pas sur `deliverySyncedAt` : l'utilisateur veut l'état actuel
      // de cet onglet, pas seulement les lignes jamais synchronisées.
      const where =
        status === 'CLICKED'
          ? 'ti.clickCount > 0'
          : 'ti.status = ?';

      // 1) Combien d'invitations l'onglet contient (avant filtre Resend)
      const countRows = await d1All(
        `SELECT COUNT(*) AS c FROM TeacherInvitation ti WHERE ${where}`,
        ...(status === 'CLICKED' ? [] : [status]),
      );
      matched = Number(countRows?.[0]?.c || 0);

      // 2) Celles qui portent un ID Resend (les autres ne sont pas
      //    interrogeables : pas d'ID de message → pas de statut à récupérer)
      invitations = await d1All(
        `SELECT ti.id, ti.email, ti.resendMessageId, ti.deliveryStatus
         FROM TeacherInvitation ti
         WHERE ${where} AND ti.resendMessageId IS NOT NULL
         ORDER BY ti.createdAt DESC
         LIMIT 50`,
        ...(status === 'CLICKED' ? [] : [status]),
      );
    } else {
      // ── Toutes les invitations (comportement historique) ────────────────
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      invitations = await d1All(
        `SELECT ti.id, ti.email, ti.resendMessageId, ti.deliveryStatus
         FROM TeacherInvitation ti
         WHERE ti.resendMessageId IS NOT NULL
           AND (
             ti.deliveryStatus IS NULL
             OR ti.deliveryStatus IN ('sent', 'delivered')
             OR ti.deliverySyncedAt IS NULL
             OR ti.deliverySyncedAt < ?
           )
         ORDER BY ti.createdAt DESC
         LIMIT 50`,
        cutoff,
      );
      matched = invitations.length;
    }

    const results: Array<{ id: string; email: string; status?: string; error?: string }> = [];
    for (const inv of invitations) {
      const result = await syncInvitationDeliveryStatus(inv.id);
      results.push({
        id: inv.id,
        email: inv.email,
        status: result.status,
        error: result.error,
      });
    }

    // 2026-10-27 : Resend ne conserve les emails que 30 jours → sur les
    // invitations anciennes, l'API renvoie « Email not found ». On le
    // distingue des vraies erreurs pour ne pas annoncer « synchronisé »
    // alors que rien n'a bougé.
    const notFound = results.filter((r) => r.error === 'Email not found').length;
    const failed = results.filter((r) => r.error && r.error !== 'Email not found').length;
    const ok = results.length - notFound - failed;

    return NextResponse.json({
      synced: results.length,
      scope: status || 'ALL',
      matched,
      skipped: Math.max(0, matched - results.length),
      ok,
      notFound,
      failed,
      results,
    });
  } catch (e: any) {
    console.error('sync-delivery error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

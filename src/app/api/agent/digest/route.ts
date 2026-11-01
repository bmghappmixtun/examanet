// @ts-nocheck
/**
 * Public agent digest endpoint
 * Returns a summary of recent errors for Mavis to read at session start
 * No auth (just a GET) — meant to be called by the agent

Mavis can call this at the start of any session to see if there are
unhandled errors that need attention.

 * 2026-11-01 — FIX du "digest aveugle" (#117bis) :
 * la version précédente lisait `e.severity` et `e.reference` via le proxy
 * Prisma-compat de @/lib/d1-admin. Ces colonnes N'EXISTENT PAS dans la
 * table D1 ErrorLog (colonnes réelles vérifiées par pragma_table_info :
 * id source level message stack url method statusCode userId context
 * agentSeen createdAt updatedAt seenBySession userEmail).
 *   -> `severity` n'existe pas  => critical/error/warning valaient TOUJOURS 0
 *   -> `reference` n'existe pas => ref: undefined
 * Les compteurs de sévérité étaient donc nuls en permanence, même avec des
 * erreurs CRITICAL en base : l'agent croyait le site propre.
 *
 * Piège SQLite associé : dans le proxy, un identifiant en DOUBLE QUOTES qui
 * ne correspond à aucune colonne est traité comme un LITTÉRAL CHAÎNE
 * ("agentSeenAt" >= 1234 -> 'agentSeenAt' >= 1234 -> toujours VRAI).
 * Un filtre sur une colonne inexistante est donc silencieusement INERTE
 * au lieu de lever une erreur -> c'est l'origine du bug #117.
 *
 * Correctif : SQL brut sur les vraies colonnes (plus de mapping Prisma),
 * createdAt comparé en epoch ms (INTEGER) et niveau normalisé en MAJUSCULES
 * car la base contient 'ERROR' (331) mais aussi 'error' (1).
 */
import { NextResponse } from 'next/server';
import { getD1 } from '@/lib/db-d1';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const db = await getD1();

    const stmt = db
      .prepare(
        `SELECT id, source, level, message, url, createdAt
           FROM ErrorLog
          WHERE createdAt >= ?
          ORDER BY createdAt DESC
          LIMIT 20`,
      )
      .bind(since);

    const res = await stmt.all();
    const recent = res?.results || [];

    const lvl = (r: any) => String(r.level || '').toUpperCase();

    return NextResponse.json({
      total: recent.length,
      critical: recent.filter((r: any) => lvl(r) === 'CRITICAL').length,
      error: recent.filter((r: any) => lvl(r) === 'ERROR').length,
      warning: recent.filter((r: any) => lvl(r) === 'WARNING').length,
      recent: recent.slice(0, 10).map((r: any) => ({
        ref: r.id,
        severity: lvl(r),
        source: r.source,
        msg: String(r.message || '').slice(0, 120),
        time: new Date(r.createdAt).toISOString(),
      })),
      nextSteps:
        recent.length > 0
          ? 'Check /admin/erreurs on Examanet for full details. View error.stack for debugging.'
          : 'All clear — no recent errors.',
    });
  } catch (err: any) {
    // ECHEC BRUTAL = information : ne jamais renvoyer un "0 erreur" silencieux
    // quand la requête a échoué (cf. leçon #118).
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

// @ts-nocheck
/**
 * Mavis reads the latest nightly error digest
 * Public GET (no auth) — Mavis can call this at session start
 *
 * Returns the summary of the most recent nightly cleanup run
 * so Mavis knows what errors to investigate and fix.
 *
 * 2026-11-01 — FIX du bug #117 (« le digest renvoie le backlog »).
 *
 * 1) FENÊTRE 24 h INERTE
 *    L'ancien code filtrait sur `agentSeenAt` — une colonne qui N'EXISTE PAS
 *    dans ErrorLog (le cron nightly-cleanup écrit `agentSeen = 1` + `updatedAt`,
 *    cf. src/app/api/cron/nightly-cleanup/route.ts:86).
 *    Piège SQLite : dans le proxy Prisma-compat, un identifiant en DOUBLE
 *    QUOTES inconnu est traité comme un LITTÉRAL CHAÎNE
 *    => "agentSeenAt" >= <epoch> est TOUJOURS VRAI
 *    => la fenêtre 24 h ne filtrait rien et la route renvoyait le BACKLOG
 *    (200 lignes, les plus anciennes en septembre) au lieu des dernières 24 h.
 *    Conséquence : le nightly relisait/repatchait des bugs DÉJÀ corrigés.
 *
 * 2) COLONNES FANTÔMES
 *    `severity` et `reference` n'existent pas non plus (les vraies colonnes
 *    sont `level` et `id`) => severities: [undefined], reference: undefined,
 *    lastRunAt: null.
 *
 * 3) TRI
 *    ORDER BY "agentSeenAt" (constante littérale) => aucun tri réel.
 *
 * Correctif : SQL brut sur les colonnes réelles, filtre
 * `agentSeen = 1 AND createdAt >= ?` (epoch ms, la colonne est un INTEGER),
 * niveau normalisé en MAJUSCULES ('ERROR' et 'error' coexistent en base).
 * `reference` devient l'identifiant de GROUPE (hash du message) : stable
 * d'une nuit à l'autre, donc exploitable comme clé de suivi.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getD1 } from '@/lib/db-d1';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hashMessage(message: string): string {
  let h = 0;
  for (let i = 0; i < message.length; i++) {
    h = ((h << 5) - h + message.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export async function GET(req: NextRequest) {
  const since = Date.now() - 24 * 60 * 60 * 1000;

  let rows: any[] = [];
  try {
    const db = await getD1();
    const res = await db
      .prepare(
        `SELECT id, source, level, message, stack, url, context, createdAt, updatedAt
           FROM ErrorLog
          WHERE agentSeen = 1 AND createdAt >= ?
            AND source != 'PROBE'   -- 2026-11-01: sondes de diagnostic exclues
          ORDER BY createdAt DESC
          LIMIT 200`,
      )
      .bind(since)
      .all();
    rows = res?.results || [];
  } catch (e: any) {
    // Échec franc : ne jamais laisser croire "0 erreur" (leçon #118).
    console.error('[nightly-digest] D1 query failed:', e?.message);
    return NextResponse.json(
      { ok: false, error: 'digest_query_failed', detail: e?.message },
      { status: 500 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No errors in the last 24h (or the nightly cleanup marked none as seen).',
      windowHours: 24,
      count: 0,
      grouped: [],
    });
  }

  const grouped = new Map<
    string,
    { count: number; sample: any; severities: Set<string>; urls: Set<string>; firstSeen: number; lastSeen: number }
  >();

  for (const e of rows) {
    const message = String(e.message || '');
    const key = hashMessage(message);
    const severity = String(e.level || '').toUpperCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
      existing.severities.add(severity);
      if (e.url) existing.urls.add(e.url);
      if (e.createdAt < existing.firstSeen) existing.firstSeen = e.createdAt;
      if (e.createdAt > existing.lastSeen) existing.lastSeen = e.createdAt;
    } else {
      grouped.set(key, {
        count: 1,
        sample: e,
        severities: new Set([severity]),
        urls: new Set(e.url ? [e.url] : []),
        firstSeen: e.createdAt,
        lastSeen: e.createdAt,
      });
    }
  }

  const sorted = Array.from(grouped.values()).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    windowHours: 24,
    // Le dernier `updatedAt` = le passage du cron nightly-cleanup qui a marqué
    // ces lignes comme vues (le cron écrit agentSeen=1 + updatedAt).
    lastRunAt: rows.reduce((max, r) => Math.max(max, Number(r.updatedAt) || 0), 0),
    count: rows.length,
    grouped: sorted.slice(0, 20).map((g) => ({
      reference: hashMessage(String(g.sample.message || '')),
      count: g.count,
      severities: Array.from(g.severities),
      message: g.sample.message,
      stack: g.sample.stack, // pour que l'agent nighttime puisse cibler le fichier:ligne
      url: g.sample.url,
      urls: Array.from(g.urls).slice(0, 5),
      source: g.sample.source,
      sampleId: g.sample.id,
      createdAt: g.sample.createdAt,
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
      context: g.sample.context,
    })),
  });
}

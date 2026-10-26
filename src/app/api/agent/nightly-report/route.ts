// @ts-nocheck
/**
 * Mavis nightly fix report
 * POSTs the agent's fix summary to Discord (using the same webhook as
 * the error logger) and returns the post result.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Body: {
 *   title: string,
 *   summary: string,           // one-line
 *   fixedCount: number,
 *   deferredCount: number,
 *   filesChanged: string[],
 *   commits: string[],         // commit SHAs
 *   details?: string,          // long-form markdown body
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSecret, requireCronSecret } from '@/lib/cf-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 2026-10-26: `process.env` est figé au BUILD dans un CF Worker (OpenNext
// l'injecte depuis wrangler.jsonc). Un secret posé via `wrangler secret put`
// n'est donc JAMAIS visible ici → le webhook était toujours vide en runtime.
// La lecture se fait maintenant via getSecret(), qui interroge `ctx.env`
// (le binding) en priorité. Lire DANS le handler, pas au scope module.

export async function POST(req: NextRequest) {
  // 2026-10-26 — CORRECTION D'UN BYPASS D'AUTHENTIFICATION.
  //
  // L'ancien guard était :
  //   if (!auth || (expectedCron && auth === expectedCron) || (expectedAgent && auth === expectedAgent))
  // La branche `!auth` signifiait « PAS de header = AUTORISÉ ». Concrètement :
  //   POST sans header  → 503 no_webhook  (l'auth était PASSÉE)
  //   POST avec un faux → 401 unauthorized
  // i.e. une requête ANONYME passait le contrôle. Effet possible : n'importe
  // qui pouvait poster du contenu arbitraire sur le webhook Discord du
  // projet (quand il existera) — et une future régression sur ce tableau
  // rouvrirait l'écriture D1.
  //
  // requireCronSecret() applique la règle correcte : 401 si aucun secret
  // n'est fourni, comparaison stricte avec CRON_SECRET ou AGENT_REPORT_TOKEN.
  const authErr = await requireCronSecret(req, { allowAgentToken: true });
  if (authErr) return authErr;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const {
    title = '🌙 Nightly cleanup report',
    summary = '',
    fixedCount = 0,
    deferredCount = 0,
    filesChanged = [] as string[],
    commits = [] as string[],
    details = '',
  } = body || {};

  // 2026-10-26: lu au moment de la requête (binding runtime), pas au build.
  const DISCORD_WEBHOOK_URL = (await getSecret('DISCORD_WEBHOOK_URL')) || '';
  if (!DISCORD_WEBHOOK_URL) {
    return NextResponse.json({ ok: false, error: 'no_webhook' }, { status: 503 });
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Auto-fixed', value: String(fixedCount), inline: true },
    { name: 'Deferred', value: String(deferredCount), inline: true },
    { name: 'Files', value: String(filesChanged.length), inline: true },
  ];
  if (commits.length) {
    fields.push({
      name: 'Commits',
      value: commits.map((c: string) => `\`${c.slice(0, 7)}\``).join(' '),
      inline: false,
    });
  }
  if (filesChanged.length) {
    fields.push({
      name: 'Files changed',
      value: filesChanged.slice(0, 8).map((f: string) => `\`${f}\``).join(' '),
      inline: false,
    });
  }
  if (details) {
    fields.push({
      name: 'Details',
      value: details.slice(0, 1000),
      inline: false,
    });
  }

  const embed = {
    title,
    description: summary,
    color: 0x10b981, // green
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: 'Examanet nightly fix report' },
  };

  let posted = false;
  let postError: string | null = null;
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🌙 **Nightly fix complete** — ${fixedCount} auto-fixed, ${deferredCount} deferred`,
        embeds: [embed],
        allowed_mentions: { parse: [] },
      }),
    });
    posted = res.ok;
    if (!res.ok) {
      postError = `HTTP ${res.status}: ${await res.text().catch(() => '')}`;
    }
  } catch (e: any) {
    postError = e?.message || String(e);
  }

  return NextResponse.json({ ok: posted, error: postError });
}

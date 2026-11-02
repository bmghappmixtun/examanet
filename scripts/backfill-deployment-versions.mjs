#!/usr/bin/env node
/**
 * Backfill du registre `DeploymentVersion` (D1) à partir de l'historique
 * Cloudflare Workers.
 *
 * Cloudflare conserve les versions de `examanet-prod` depuis la création du
 * worker (24/08/2026, n°1) — 700+ versions à ce jour. Ce script les relit,
 * attribue le numéro de version Examanet (0.01, 0.02... +0.01 par
 * déploiement de code) et enrichit avec le commit GitHub correspondant
 * (run Actions le plus proche dans le temps, fenêtre ±15 min).
 *
 * Usage :
 *   node scripts/backfill-deployment-versions.mjs --env=prod
 *   node scripts/backfill-deployment-versions.mjs --env=prod --dry-run
 *   node scripts/backfill-deployment-versions.mjs --env=prod --reset
 *
 * Variables d'environnement :
 *   CLOUDFLARE_API_TOKEN / CF_API_TOKEN   token API Cloudflare
 *   GITHUB_TOKEN                          token GitHub (optionnel, pour les commits)
 *   CF_ACCOUNT_ID, D1_DATABASE_ID         (sinon lus dans la config wrangler)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const API = 'https://api.cloudflare.com/client/v4';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) return [a, 'true'];
    // --dry-run -> dryRun, --env=prod -> env
    const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return [key, m[2] ?? 'true'];
  }),
);

const ENV = args.env || 'prod';
const SCRIPT_NAME = args.script || (ENV === 'prod' ? 'examanet-prod' : 'examanet-dev');
const CONFIG_FILE =
  args.config || (ENV === 'prod' ? 'wrangler.prod.jsonc' : 'wrangler.dev.jsonc');
const DRY_RUN = args.dryRun === 'true';
const RESET = args.reset === 'true';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_EXAMANET_TOKEN || '';

function log(...a) {
  console.log('[backfill-versions]', ...a);
}
function fail(msg, code = 1) {
  console.error('[backfill-versions] ERREUR :', msg);
  process.exit(code);
}

function readConfigValue(file, key) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || readConfigValue(CONFIG_FILE, 'account_id');
const DATABASE_ID = process.env.D1_DATABASE_ID || readConfigValue(CONFIG_FILE, 'database_id');
if (!ACCOUNT_ID) fail(`account_id introuvable (${CONFIG_FILE})`);
if (!DATABASE_ID) fail(`database_id introuvable (${CONFIG_FILE})`);

async function cfApi(pathname) {
  if (!TOKEN) fail('CLOUDFLARE_API_TOKEN / CF_API_TOKEN absent');
  const res = await fetch(`${API}${pathname}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) fail(`CF API ${pathname} -> ${JSON.stringify(data.errors || data)}`);
  return data.result;
}

async function d1Query(sql, params = []) {
  const res = await fetch(`${API}/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) fail(`D1 query failed: ${JSON.stringify(data.errors || data)}`);
  return data.result?.[0]?.results ?? [];
}

// ------------------------------------------------------------------ CF
async function fetchAllVersions() {
  const all = [];
  let page = 1;
  for (;;) {
    const r = await cfApi(
      `/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/versions?per_page=100&page=${page}`,
    );
    const items = r?.items || [];
    all.push(...items);
    if (items.length < 100) break;
    page++;
    if (page > 50) break;
  }
  const byId = new Map(all.map((v) => [v.id, v]));
  return [...byId.values()].sort((a, b) => a.number - b.number);
}

async function fetchCurrentDeployment() {
  const r = await cfApi(`/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/deployments`);
  const d = r?.deployments?.[0];
  if (!d) return null;
  const live = (d.versions || []).find((v) => v.percentage === 100) || d.versions?.[0];
  return { deploymentId: d.id, versionId: live?.version_id };
}

// ------------------------------------------------------------------ GH
async function fetchGithubRuns() {
  if (!GH_TOKEN) {
    log('pas de token GitHub -> les commits ne seront pas enrichis');
    return [];
  }
  const runs = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      `https://api.github.com/repos/bmghappmixtun/examanet/actions/workflows/deploy.yml/runs?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${GH_TOKEN}` } },
    );
    if (!res.ok) break;
    const data = await res.json();
    const items = data.workflow_runs || [];
    runs.push(...items);
    if (items.length < 100) break;
  }
  return runs
    .filter((r) => r.conclusion === 'success' || r.conclusion === 'failure')
    .map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
      sha: r.head_sha,
      message: (r.head_commit?.message || '').split('\n')[0],
      author: r.head_commit?.author?.name || r.actor?.login || null,
      conclusion: r.conclusion,
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Run CI le plus plausible pour une date de déploiement donnée. */
function matchRun(runs, deployedAt) {
  let best = null;
  let bestDist = Infinity;
  for (const r of runs) {
    // le déploiement se produit pendant le run : entre createdAt et updatedAt
    const dist = deployedAt < r.createdAt ? r.createdAt - deployedAt : deployedAt > r.updatedAt ? deployedAt - r.updatedAt : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }
  return bestDist <= 15 * 60 * 1000 ? best : null;
}

/**
 * Repli pour les déploiements manuels (avant la mise en place de la CI) :
 * le commit du dépôt dont la date est la plus proche AVANT le déploiement
 * (c'est généralement HEAD de main au moment du `wrangler deploy`).
 */
function loadGitHistory() {
  try {
    const out = execFileSync('git', ['log', '--format=%H|%at|%s'], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 })
      .toString()
      .trim();
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, at, ...rest] = line.split('|');
        return { sha, ts: Number(at) * 1000, message: rest.join('|') };
      })
      .sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  }
}

function matchGit(commits, deployedAt) {
  let best = null;
  for (const c of commits) {
    if (c.ts <= deployedAt) best = c;
    else break;
  }
  return best;
}

// ------------------------------------------------------------------ main
async function main() {
  log(`env=${ENV} script=${SCRIPT_NAME}`);
  const versions = await fetchAllVersions();
  log(`versions Cloudflare : ${versions.length} (n°${versions[0]?.number} → n°${versions?.at(-1)?.number})`);

  const current = await fetchCurrentDeployment();
  log(`version live : ${current?.versionId}`);

  const runs = await fetchGithubRuns();
  log(`runs Actions : ${runs.length}`);

  const gitCommits = loadGitHistory();
  log(`commits git (main) : ${gitCommits.length}`);

  // Numérotation : uniquement les déploiements de code, dans l'ordre chrono
  let index = 0;
  const rows = versions.map((v) => {
    const triggeredBy = v?.annotations?.['workers/triggered_by'] || 'version_upload';
    const type = triggeredBy === 'secret' ? 'secret' : triggeredBy === 'upload' ? 'create' : 'code';
    const deployedAt = Math.floor(new Date(v.metadata.created_on).getTime());
    let versionIndex = null;
    let versionLabel = null;
    let versionNum = null;
    if (type === 'code' || type === 'create') {
      index += 1;
      versionIndex = index;
      versionNum = index / 100;
      versionLabel = versionNum.toFixed(2);
    }
    const run = type === 'code' ? matchRun(runs, deployedAt) : null;
    const git = !run && type === 'code' ? matchGit(gitCommits, deployedAt) : null;
    return {
      id: `dv_cf_${v.number}`,
      env: ENV,
      version: versionLabel,
      versionIndex,
      versionNum,
      cfNumber: v.number,
      cfVersionId: v.id,
      cfDeploymentId: null,
      type,
      deployedAt,
      commitSha: run?.sha || git?.sha || null,
      commitMessage: run?.message || git?.message || null,
      author: run?.author || (git ? 'git' : null),
      runId: run?.id || null,
      isCurrent: current && v.id === current.versionId ? 1 : 0,
      recordedAt: Date.now(),
    };
  });

  const codeRows = rows.filter((r) => r.versionIndex);
  log(
    `déploiements de code : ${codeRows.length} → version ${codeRows[0]?.version} … ${codeRows.at(-1)?.version}`,
  );
  log(
    `événements secret : ${rows.filter((r) => r.type === 'secret').length} | enrichis GitHub : ${
      rows.filter((r) => r.commitSha).length
    }`,
  );

  if (DRY_RUN) {
    for (const r of rows.slice(-5)) {
      log(
        `  ${r.version || '(secret)'} CF#${r.cfNumber} ${r.type} ${new Date(r.deployedAt).toISOString()} ` +
          `${r.commitSha ? r.commitSha.slice(0, 8) : '—'}`,
      );
    }
    log('DRY RUN — rien n\'est écrit');
    return;
  }

  // La table doit exister
  const sqlFile = path.join(ROOT, 'migrations', '0015_deployment_versions.sql');
  if (!fs.existsSync(sqlFile)) fail('migration 0015_deployment_versions.sql introuvable');
  const createSql = fs
    .readFileSync(sqlFile, 'utf8')
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean)
    .join(';');
  await d1Query(createSql);
  log('table DeploymentVersion ensured ✅');

  if (RESET) {
    await d1Query('DELETE FROM DeploymentVersion WHERE env = ?', [ENV]);
    log('registre remis à zéro');
  }

  // Upsert par lots (INSERT OR REPLACE grâce à l'index unique env+cfVersionId)
  // D1 limite a 100 variables liees par requete -> 5 lignes x 16 colonnes = 80
  const BATCH = 5;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = [];
    const COLS = [
      'id', 'env', 'version', 'versionIndex', 'versionNum', 'cfNumber', 'cfVersionId',
      'cfDeploymentId', 'type', 'deployedAt', 'commitSha', 'commitMessage', 'author',
      'runId', 'isCurrent', 'recordedAt',
    ];
    const placeholders = chunk
      .map(() => `(${COLS.map(() => '?').join(',')})`)
      .join(',');
    for (const r of chunk) {
      values.push(
        r.id,
        ENV,
        r.version,
        r.versionIndex,
        r.versionNum,
        r.cfNumber,
        r.cfVersionId,
        r.cfDeploymentId,
        r.type,
        r.deployedAt,
        r.commitSha,
        r.commitMessage,
        r.author,
        r.runId,
        r.isCurrent,
        r.recordedAt,
      );
    }
    await d1Query(
      `INSERT OR REPLACE INTO DeploymentVersion (${COLS.join(', ')}) VALUES ${placeholders}`,
      values,
    );
  }

  const count = await d1Query('SELECT COUNT(*) AS c FROM DeploymentVersion WHERE env = ?', [ENV]);
  log(`OK — ${count?.[0]?.c} versions enregistrées en base`);
}

main().catch((e) => fail(e?.message || String(e)));

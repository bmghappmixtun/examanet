/**
 * Helpers partagés pour le registre des versions déployées.
 *
 * Utilisés par :
 *  - scripts/register-deployment.mjs  (enregistrement après un déploiement CI)
 *  - scripts/sync-deployment-versions.mjs (synchronisation quotidienne)
 *  - scripts/backfill-deployment-versions.mjs (backfill initial)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const CF_API = 'https://api.cloudflare.com/client/v4';
export const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Extrait une valeur scalaire d'un fichier JSONC (wrangler.*.jsonc). */
export function readConfigValue(file, key) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Parse les arguments `--cle=valeur` / `--flag` en camelCase. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = m[2] ?? 'true';
  }
  return out;
}

export function envConfig(env) {
  const configFile =
    env === 'prod' ? 'wrangler.prod.jsonc' : 'wrangler.dev.jsonc';
  return {
    configFile,
    scriptName: env === 'prod' ? 'examanet-prod' : 'examanet-dev',
    accountId: process.env.CF_ACCOUNT_ID || readConfigValue(configFile, 'account_id'),
    databaseId: process.env.D1_DATABASE_ID || readConfigValue(configFile, 'database_id'),
    token: process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '',
  };
}

export async function cfApi(cfg, pathname) {
  if (!cfg.token) throw new Error('CLOUDFLARE_API_TOKEN / CF_API_TOKEN absent');
  const res = await fetch(`${CF_API}${pathname}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    throw new Error(
      `API Cloudflare ${pathname} -> ${JSON.stringify(data.errors || data)}`,
    );
  }
  return data.result;
}

/** Exécute une requête D1 via l'API REST (limite : 100 variables liées). */
export async function d1Query(cfg, sql, params = []) {
  if (!cfg.token) throw new Error('CLOUDFLARE_API_TOKEN / CF_API_TOKEN absent');
  const res = await fetch(
    `${CF_API}/accounts/${cfg.accountId}/d1/database/${cfg.databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(data.errors || data)}`);
  }
  return data.result?.[0]?.results ?? [];
}

/** Historique COMPLET des versions CF d'un worker (paginé). */
export async function fetchAllVersions(cfg) {
  const all = [];
  for (let page = 1; page <= 60; page++) {
    const r = await cfApi(
      cfg,
      `/accounts/${cfg.accountId}/workers/scripts/${cfg.scriptName}/versions?per_page=100&page=${page}`,
    );
    const items = r?.items || [];
    all.push(...items);
    if (items.length < 100) break;
  }
  const byId = new Map(all.map((v) => [v.id, v]));
  return [...byId.values()].sort((a, b) => a.number - b.number);
}

/** Le déploiement actuellement en ligne (version_id à 100 %). */
export async function fetchCurrentDeployment(cfg) {
  const r = await cfApi(
    cfg,
    `/accounts/${cfg.accountId}/workers/scripts/${cfg.scriptName}/deployments`,
  );
  const d = r?.deployments?.[0];
  if (!d) return null;
  const live =
    (d.versions || []).find((v) => v.percentage === 100) || d.versions?.[0];
  return { deploymentId: d.id, versionId: live?.version_id, createdOn: d.created_on };
}

/** Détail d'une version CF précise (numéro, date, type). */
export async function fetchVersion(cfg, versionId) {
  return cfApi(
    cfg,
    `/accounts/${cfg.accountId}/workers/scripts/${cfg.scriptName}/versions/${versionId}`,
  );
}

/** 'code' | 'secret' | 'create' à partir de l'annotation Cloudflare. */
export function versionType(v) {
  const triggeredBy = v?.annotations?.['workers/triggered_by'] || 'version_upload';
  if (triggeredBy === 'secret') return 'secret';
  if (triggeredBy === 'upload') return 'create';
  return 'code';
}

/** Les runs GitHub Actions (pour retrouver le commit d'un déploiement). */
export async function fetchGithubRuns() {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_EXAMANET_TOKEN || '';
  if (!token) return [];
  const runs = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      `https://api.github.com/repos/bmghappmixtun/examanet/actions/workflows/deploy.yml/runs?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } },
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
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Run CI le plus plausible pour une date de déploiement (±15 min). */
export function matchRun(runs, deployedAt) {
  let best = null;
  let bestDist = Infinity;
  for (const r of runs) {
    const dist =
      deployedAt < r.createdAt
        ? r.createdAt - deployedAt
        : deployedAt > r.updatedAt
          ? deployedAt - r.updatedAt
          : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  }
  return bestDist <= 15 * 60 * 1000 ? best : null;
}

/** Historique git de main (repli pour les déploiements manuels). */
export function loadGitHistory() {
  try {
    const out = execFileSync('git', ['log', '--format=%H|%at|%s'], {
      cwd: ROOT,
      maxBuffer: 32 * 1024 * 1024,
    })
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

/** Commit de main le plus proche AVANT une date donnée. */
export function matchGit(commits, deployedAt) {
  let best = null;
  for (const c of commits) {
    if (c.ts <= deployedAt) best = c;
    else break;
  }
  return best;
}

/** Insère des lignes par lots (D1 : 100 variables liées max par requête). */
export async function insertRows(cfg, cols, rows, table = 'DeploymentVersion') {
  const BATCH = 5; // 5 lignes x 16 colonnes = 80 variables
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = [];
    const placeholders = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    for (const r of chunk) for (const c of cols) values.push(r[c] ?? null);
    await d1Query(
      cfg,
      `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES ${placeholders}`,
      values,
    );
  }
}

/** Crée la table si elle n'existe pas (à partir du fichier de migration). */
export async function ensureTable(cfg, migrationFile) {
  const sqlFile = path.join(ROOT, 'migrations', migrationFile);
  const raw = fs.readFileSync(sqlFile, 'utf8');
  const sql = raw
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
  await d1Query(cfg, sql);
}

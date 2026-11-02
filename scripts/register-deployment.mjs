#!/usr/bin/env node
/**
 * Enregistre le déploiement courant dans la table D1 `DeploymentVersion`.
 *
 * Appelé par la CI (.github/workflows/deploy.yml) juste après
 * `wrangler deploy` : chaque déploiement de code reçoit le prochain numéro
 * de version Examanet (0.01, 0.02, 0.03... +0.01 par déploiement).
 *
 * Le numéro est FIGÉ en base : l'historique reste stable même si
 * Cloudflare purge ses anciennes versions, et un redéploiement du même
 * commit n'efface rien.
 *
 * Idempotent : si la version CF est déjà enregistrée, le script ne fait
 * rien (sortie 0) — un rerun de la CI ne crée pas de doublon.
 *
 * Usage :
 *   node scripts/register-deployment.mjs --env=prod
 *   node scripts/register-deployment.mjs --env=dev --script=examanet-dev --config=wrangler.dev.jsonc
 *   node scripts/register-deployment.mjs --env=prod --dry-run
 *
 * Variables d'environnement :
 *   CLOUDFLARE_API_TOKEN (ou CF_API_TOKEN)  token API Cloudflare
 *   CF_ACCOUNT_ID                            account id (sinon lu dans la config)
 *   GITHUB_SHA / GITHUB_RUN_ID              enrichissement commit (CI)
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------- args
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
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
const API = 'https://api.cloudflare.com/client/v4';

// ---------------------------------------------------------------- helpers
function log(...a) {
  console.log('[register-deployment]', ...a);
}

function fail(msg, code = 1) {
  console.error('[register-deployment] ERREUR :', msg);
  process.exit(code);
}

/** Extrait une valeur scalaire d'un fichier JSONC (wrangler.*.jsonc). */
function readConfigValue(file, key) {
  try {
    const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function cfApi(pathname, { method = 'GET', body } = {}) {
  if (!TOKEN) fail('CLOUDFLARE_API_TOKEN / CF_API_TOKEN absent');
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    fail(`API Cloudflare ${pathname} -> ${JSON.stringify(data.errors || data)}`);
  }
  return data.result;
}

/** Exécute une requête sur la D1 via l'API REST Cloudflare. */
async function d1Query(databaseId, sql, params = []) {
  const res = await fetch(`${API}/accounts/${ACCOUNT_ID}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    fail(`D1 query failed: ${JSON.stringify(data.errors || data)}`);
  }
  const r = data.result?.[0];
  return r?.results ?? [];
}

// ---------------------------------------------------------------- main
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || readConfigValue(CONFIG_FILE, 'account_id');
const DATABASE_ID = process.env.D1_DATABASE_ID || readConfigValue(CONFIG_FILE, 'database_id');

if (!ACCOUNT_ID) fail(`account_id introuvable (${CONFIG_FILE} / CF_ACCOUNT_ID)`);
if (!DATABASE_ID) fail(`database_id introuvable (${CONFIG_FILE} / D1_DATABASE_ID)`);

async function main() {
  // 1. Version CF actuellement déployée
  const deployments = await cfApi(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/deployments`,
  );
  const deployment = deployments?.deployments?.[0];
  if (!deployment) fail('aucun déploiement trouvé');

  const live = (deployment.versions || []).find((v) => v.percentage === 100) || deployment.versions?.[0];
  const cfVersionId = live?.version_id;
  if (!cfVersionId) fail('version_id introuvable dans le déploiement courant');

  const version = await cfApi(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/versions/${cfVersionId}`,
  );

  const triggeredBy = version?.annotations?.['workers/triggered_by'] || 'version_upload';
  const type = triggeredBy === 'secret' ? 'secret' : triggeredBy === 'upload' ? 'create' : 'code';
  const deployedAt = Math.floor(
    new Date(version?.metadata?.created_on || deployment.created_on).getTime(),
  );

  // 2. Déjà enregistré ?
  const existing = await d1Query(
    DATABASE_ID,
    'SELECT id, version FROM DeploymentVersion WHERE env = ? AND cfVersionId = ? LIMIT 1',
    [ENV, cfVersionId],
  );
  if (existing.length > 0) {
    log(
      `déjà enregistré (version ${existing[0].version || '-'}) — rien à faire ` +
        `(CF #${version.number}, ${cfVersionId})`,
    );
    return;
  }

  // 3. Prochain numéro de version (uniquement pour les déploiements de code)
  let versionIndex = null;
  let versionLabel = null;
  let versionNum = null;
  if (type === 'code' || type === 'create') {
    const max = await d1Query(
      DATABASE_ID,
      'SELECT MAX(versionIndex) AS m FROM DeploymentVersion WHERE env = ? AND versionIndex IS NOT NULL',
      [ENV],
    );
    versionIndex = Number(max?.[0]?.m || 0) + 1;
    versionNum = versionIndex / 100;
    versionLabel = versionNum.toFixed(2);
  }

  // 4. Enrichissement commit (CI) — en local on laisse NULL
  const commitSha = process.env.GITHUB_SHA || null;
  const commitMessage = process.env.GITHUB_COMMIT_MESSAGE || null;
  const author = process.env.GITHUB_ACTOR || null;
  const runId = process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null;

  const id = `dv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    id,
    env: ENV,
    version: versionLabel,
    versionIndex,
    versionNum,
    cfNumber: version?.number ?? null,
    cfVersionId,
    cfDeploymentId: deployment.id ?? null,
    type,
    deployedAt,
    commitSha,
    commitMessage,
    author,
    runId,
    isCurrent: 1,
    recordedAt: Date.now(),
  };

  log(
    `à enregistrer : ${versionLabel || '(événement secret)'} | CF #${row.cfNumber} | ` +
      `${type} | ${new Date(deployedAt).toISOString()}`,
  );

  if (DRY_RUN) {
    log('DRY RUN — rien n\'est écrit');
    return;
  }

  // 5. Insertion + reset du flag isCurrent sur les anciennes lignes
  await d1Query(DATABASE_ID, 'UPDATE DeploymentVersion SET isCurrent = 0 WHERE env = ?', [ENV]);
  await d1Query(
    DATABASE_ID,
    `INSERT INTO DeploymentVersion
       (id, env, version, versionIndex, versionNum, cfNumber, cfVersionId, cfDeploymentId,
        type, deployedAt, commitSha, commitMessage, author, runId, isCurrent, recordedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.env,
      row.version,
      row.versionIndex,
      row.versionNum,
      row.cfNumber,
      row.cfVersionId,
      row.cfDeploymentId,
      row.type,
      row.deployedAt,
      row.commitSha,
      row.commitMessage,
      row.author,
      row.runId,
      row.isCurrent,
      row.recordedAt,
    ],
  );

  log(`OK — version ${versionLabel || type} enregistrée (${cfVersionId})`);
}

main().catch((e) => fail(e?.message || String(e)));

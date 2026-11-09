#!/usr/bin/env node
/**
 * Synchronise le registre D1 `DeploymentVersion` avec l'historique réel
 * Cloudflare Workers. Pensé pour un CRON QUOTIDIEN.
 *
 * Pourquoi c'est nécessaire : le hook CI (register-deployment.mjs) n'enregistre
 * que les déploiements faits par la CI. Cloudflare crée aussi une version à
 * chaque rotation de secret (`triggered_by: secret`) — le nightly met un
 * secret chaque nuit sur le worker prod, donc 1 version/jour échappait au
 * registre (8 versions manquées entre le 02/11 et le 09/11).
 *
 * Ce script :
 *  1. lit TOUTES les versions CF du worker ;
 *  2. insère celles qui manquent (sans jamais renuméroter l'existant) ;
 *  3. met `isCurrent` sur la version réellement en ligne (100 %) ;
 *  4. enregistre l'état de sync dans `DeploymentSyncState` (affiché sur la
 *     page /admin/versions).
 *
 * Idempotent : peut être lancé autant de fois que voulu (cron + manuel).
 *
 * Usage :
 *   node scripts/sync-deployment-versions.mjs --env=prod
 *   node scripts/sync-deployment-versions.mjs --env=prod --dry-run
 *   node scripts/sync-deployment-versions.mjs --env=dev
 */

import {
  parseArgs,
  envConfig,
  d1Query,
  fetchAllVersions,
  fetchCurrentDeployment,
  fetchGithubRuns,
  matchRun,
  loadGitHistory,
  matchGit,
  versionType,
  insertRows,
  ensureTable,
} from './lib/deployment-versions.mjs';

const args = parseArgs();
const T0 = Date.now();
const ENV = args.env || 'prod';
const DRY_RUN = args.dryRun === 'true';
const cfg = envConfig(ENV);

const log = (...a) => console.log('[sync-versions]', ...a);
const COLS = [
  'id', 'env', 'version', 'versionIndex', 'versionNum', 'cfNumber', 'cfVersionId',
  'cfDeploymentId', 'type', 'deployedAt', 'commitSha', 'commitMessage', 'author',
  'runId', 'isCurrent', 'recordedAt',
];

async function main() {
  const t0 = T0;
  if (!cfg.accountId || !cfg.databaseId) {
    throw new Error(`configuration incomplète (${cfg.configFile})`);
  }

  log(`env=${ENV} worker=${cfg.scriptName}`);

  const versions = await fetchAllVersions(cfg);
  const live = await fetchCurrentDeployment(cfg);
  log(`versions Cloudflare : ${versions.length} (n°${versions[0]?.number} → n°${versions.at(-1)?.number})`);
  log(`version en ligne : ${live?.versionId}`);

  const existing = await d1Query(
    cfg,
    'SELECT cfVersionId, version, versionIndex FROM DeploymentVersion WHERE env = ?',
    [ENV],
  );
  const known = new Map(existing.map((r) => [r.cfVersionId, r]));
  log(`déjà enregistrées : ${existing.length}`);

  // Prochain numéro : on continue après le MAX existant (jamais de renumérotation)
  const maxRow = await d1Query(
    cfg,
    'SELECT MAX(versionIndex) AS m FROM DeploymentVersion WHERE env = ? AND versionIndex IS NOT NULL',
    [ENV],
  );
  let nextIndex = Number(maxRow?.[0]?.m || 0) + 1;

  const runs = await fetchGithubRuns();
  const gitCommits = loadGitHistory();
  log(`runs Actions : ${runs.length} | commits git : ${gitCommits.length}`);

  const now = Date.now();
  const toInsert = [];

  for (const v of versions) {
    if (known.has(v.id)) continue;
    const type = versionType(v);
    const deployedAt = Math.floor(new Date(v.metadata.created_on).getTime());

    let version = null;
    let versionIndex = null;
    let versionNum = null;
    if (type === 'code' || type === 'create') {
      versionIndex = nextIndex++;
      versionNum = versionIndex / 100;
      version = versionNum.toFixed(2);
    }

    const run = type === 'code' ? matchRun(runs, deployedAt) : null;
    const git = !run && type === 'code' ? matchGit(gitCommits, deployedAt) : null;

    toInsert.push({
      id: `dv_cf_${v.number}`,
      env: ENV,
      version,
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
      isCurrent: live && v.id === live.versionId ? 1 : 0,
      recordedAt: now,
    });
  }

  const codeInserted = toInsert.filter((r) => r.type === 'code').length;
  const secretInserted = toInsert.filter((r) => r.type === 'secret').length;
  log(
    `à enregistrer : ${toInsert.length} (${codeInserted} code → numérotation à partir de ${nextIndex - codeInserted}, ${secretInserted} secret)`,
  );

  const liveVersion = versions.find((v) => v.id === live?.versionId);

  if (DRY_RUN) {
    for (const r of toInsert.slice(-6)) {
      log(
        `  ${r.version || '(secret)'} CF#${r.cfNumber} ${r.type} ${new Date(r.deployedAt).toISOString()} ${
          r.commitSha ? r.commitSha.slice(0, 8) : '—'
        }`,
      );
    }
    log('DRY RUN — rien n\'est écrit');
    return;
  }

  await ensureTable(cfg, '0016_deployment_sync_state.sql');
  log('table DeploymentSyncState ensured ✅');

  if (toInsert.length > 0) {
    await insertRows(cfg, COLS, toInsert);
    log(`${toInsert.length} version(s) insérée(s)`);
  }

  // isCurrent = la version CF réellement en ligne (100 %)
  await d1Query(cfg, 'UPDATE DeploymentVersion SET isCurrent = 0 WHERE env = ?', [ENV]);
  if (live?.versionId) {
    await d1Query(
      cfg,
      'UPDATE DeploymentVersion SET isCurrent = 1 WHERE env = ? AND cfVersionId = ?',
      [ENV, live.versionId],
    );
  }

  const countRow = await d1Query(
    cfg,
    'SELECT COUNT(*) AS c FROM DeploymentVersion WHERE env = ?',
    [ENV],
  );
  const registeredCount = Number(countRow?.[0]?.c || 0);
  const missingCount = Math.max(0, versions.length - registeredCount);
  const durationMs = Date.now() - t0;

  await d1Query(
    cfg,
    `INSERT INTO DeploymentSyncState
       (env, lastSyncAt, status, cfTotalVersions, cfLastNumber, liveVersionId,
        liveVersionNumber, liveType, registeredCount, missingCount, durationMs, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(env) DO UPDATE SET
       lastSyncAt = excluded.lastSyncAt,
       status = excluded.status,
       cfTotalVersions = excluded.cfTotalVersions,
       cfLastNumber = excluded.cfLastNumber,
       liveVersionId = excluded.liveVersionId,
       liveVersionNumber = excluded.liveVersionNumber,
       liveType = excluded.liveType,
       registeredCount = excluded.registeredCount,
       missingCount = excluded.missingCount,
       durationMs = excluded.durationMs,
       message = excluded.message`,
    [
      ENV,
      now,
      'ok',
      versions.length,
      versions.at(-1)?.number ?? null,
      live?.versionId ?? null,
      liveVersion?.number ?? null,
      liveVersion ? versionType(liveVersion) : null,
      registeredCount,
      missingCount,
      durationMs,
      `${toInsert.length} ajoutée(s)`,
    ],
  );

  log(
    `OK — ${registeredCount} versions en base | CF n°${versions.at(-1)?.number} | ` +
      `dérive ${missingCount} | ${durationMs} ms`,
  );
}

main().catch(async (e) => {
  console.error('[sync-versions] ERREUR :', e?.message || e);
  // trace l'échec pour que la page affiche "dernière synchronisation : échouée"
  try {
    await ensureTable(cfg, '0016_deployment_sync_state.sql');
    await d1Query(
      cfg,
      `INSERT INTO DeploymentSyncState
         (env, lastSyncAt, status, durationMs, message)
       VALUES (?, ?, 'error', ?, ?)
       ON CONFLICT(env) DO UPDATE SET
         lastSyncAt = excluded.lastSyncAt,
         status = 'error',
         durationMs = excluded.durationMs,
         message = excluded.message`,
      [ENV, Date.now(), Date.now() - T0, String(e?.message || e).slice(0, 500)],
    );
  } catch {
    /* ignore */
  }
  process.exit(1);
});

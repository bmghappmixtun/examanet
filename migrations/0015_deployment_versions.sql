-- 2026-11-02: Registre des versions déployées du site.
--
-- Trace l'historique COMPLET des déploiements : chaque déploiement de code
-- reçoit un numéro de version Examanet (0.01, 0.02, 0.03... +0.01 par
-- déploiement) figé en base, afin que l'historique reste stable même si
-- Cloudflare purge ses anciennes versions.
--
-- Les événements "secret" (rotation de secret Worker) et la création
-- initiale du worker sont également journalisés, mais SANS consommer de
-- numéro de version (seuls les déploiements de code en consomment un).
--
-- Colonnes CF (API /workers/scripts/:name/versions) :
--   id                  = version_id (UUID)
--   number              = numéro CF (1..N)
--   metadata.created_on = date de création ISO
--   annotations.workers/triggered_by = upload | version_upload | secret
--
-- Enrichissement GitHub (optionnel) : le commit est déduit du run Actions
-- le plus proche dans le temps (fenêtre ±15 min) lors du backfill, ou connu
-- exactement pour les déploiements faits par la CI.

CREATE TABLE IF NOT EXISTS DeploymentVersion (
  id             TEXT PRIMARY KEY,          -- id interne (cuid-like)
  env            TEXT NOT NULL DEFAULT 'prod',
  version        TEXT,                      -- '0.01' (NULL pour type='secret')
  versionIndex   INTEGER,                   -- 1, 2, 3... (NULL pour type='secret')
  versionNum     REAL,                      -- 0.01, 0.02... (tri/affichage)
  cfNumber       INTEGER,                   -- numéro Cloudflare
  cfVersionId    TEXT NOT NULL,             -- UUID de la version CF
  cfDeploymentId TEXT,                      -- id du deployment CF
  type           TEXT NOT NULL,             -- 'code' | 'secret' | 'create'
  deployedAt     INTEGER NOT NULL,          -- epoch ms (created_on CF)
  commitSha      TEXT,
  commitMessage  TEXT,
  author         TEXT,
  runId          INTEGER,                   -- run GitHub Actions
  isCurrent      INTEGER NOT NULL DEFAULT 0,
  recordedAt     INTEGER NOT NULL           -- epoch ms (moment de l'écriture)
);

CREATE INDEX IF NOT EXISTS idx_deploymentversion_env_version
  ON DeploymentVersion(env, versionIndex DESC);
CREATE INDEX IF NOT EXISTS idx_deploymentversion_deployedAt
  ON DeploymentVersion(env, deployedAt DESC);
CREATE INDEX IF NOT EXISTS idx_deploymentversion_cfid
  ON DeploymentVersion(cfVersionId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deploymentversion_unique_cf
  ON DeploymentVersion(env, cfVersionId);

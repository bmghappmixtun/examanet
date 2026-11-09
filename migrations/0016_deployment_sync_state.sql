-- 2026-11-09: État de la synchronisation quotidienne du registre des versions.
--
-- Le hook CI (scripts/register-deployment.mjs) n'enregistre que les
-- déploiements faits par la CI. Or Cloudflare crée aussi des versions à
-- chaque rotation de secret (`triggered_by: secret`) — le nightly met un
-- secret chaque nuit, donc le worker prod créait 1 version/jour non
-- enregistrée (8 versions manquées entre le 02/11 et le 09/11).
--
-- Cette table trace la dernière synchronisation avec l'API Cloudflare :
-- la page /admin/versions affiche « synchronisé il y a X » et alerte si
-- le registre est en retard sur Cloudflare.

CREATE TABLE IF NOT EXISTS DeploymentSyncState (
  env               TEXT PRIMARY KEY,   -- 'prod' | 'dev'
  lastSyncAt        INTEGER NOT NULL,   -- epoch ms
  status            TEXT NOT NULL,      -- 'ok' | 'error'
  cfTotalVersions   INTEGER,            -- nb total de versions CF
  cfLastNumber      INTEGER,            -- dernier n° CF
  liveVersionId     TEXT,               -- version_id en ligne (100 %)
  liveVersionNumber INTEGER,            -- son n° CF
  liveType          TEXT,               -- 'code' | 'secret' | 'create'
  registeredCount   INTEGER,            -- lignes dans DeploymentVersion
  missingCount      INTEGER,            -- versions CF non enregistrées (dérive)
  durationMs        INTEGER,
  message           TEXT
);

-- 2026-09-10: UptimeRobot monitoring alerts
-- Used by /api/monitoring/uptimerobot and /api/monitoring/uptimerobot/alerts
CREATE TABLE IF NOT EXISTS MonitoringAlert (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  monitorId INTEGER,
  monitorName TEXT,
  monitorUrl TEXT,
  alertType TEXT,
  alertDetails TEXT,
  alertDuration INTEGER,
  createdAt INTEGER NOT NULL,
  resolved INTEGER DEFAULT 0,
  resolvedAt INTEGER,
  resolvedBy TEXT
);

CREATE INDEX IF NOT EXISTS idx_monitoring_alert_unresolved ON MonitoringAlert(createdAt) WHERE resolved = 0;

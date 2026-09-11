-- 2026-09-11: Add rollback tracking columns to MonitoringAlert table
-- The UptimeRobot auto-rollback feature was inserting alerts but couldn't
-- track the rollback outcome. Added 4 columns to fix this.
ALTER TABLE MonitoringAlert ADD COLUMN rollbackSuccess INTEGER DEFAULT 0;
ALTER TABLE MonitoringAlert ADD COLUMN rollbackFromVersion TEXT;
ALTER TABLE MonitoringAlert ADD COLUMN rollbackToVersion TEXT;
ALTER TABLE MonitoringAlert ADD COLUMN rollbackError TEXT;

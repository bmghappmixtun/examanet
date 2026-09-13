-- 2026-09-13: Teacher Journey Tracker
-- Tracks the onboarding path for BOTH invited teachers and self-signup teachers.
-- Admin can see a timeline of events per teacher on /admin/verifications.

-- New table for events
CREATE TABLE IF NOT EXISTS TeacherJourneyEvent (
  id TEXT PRIMARY KEY,
  teacherId TEXT NOT NULL,
  eventType TEXT NOT NULL,
  page TEXT,
  metadata TEXT,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tje_teacherId ON TeacherJourneyEvent(teacherId);
CREATE INDEX IF NOT EXISTS idx_tje_createdAt ON TeacherJourneyEvent(createdAt);
CREATE INDEX IF NOT EXISTS idx_tje_eventType ON TeacherJourneyEvent(eventType);

-- Quick-access state on User table
ALTER TABLE User ADD COLUMN currentJourneyStep TEXT;
ALTER TABLE User ADD COLUMN lastJourneyAt INTEGER;

-- 2026-09-07: Add passwordChangedAt to User
-- Invalidates all existing sessions when password is changed.
-- getSession() now filters: Session.createdAt > User.passwordChangedAt

ALTER TABLE User ADD COLUMN passwordChangedAt INTEGER;

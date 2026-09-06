-- 2026-09-06: Add publicKey, secretKey, displayName, notes, monthlyQuota
-- columns to ApiProvider for proper iLoveAPI/APIConvert/Neon key storage.
-- Previously the route tried to write to columns that didn't exist,
-- causing keys to silently fail to save.
ALTER TABLE ApiProvider ADD COLUMN publicKey TEXT;
ALTER TABLE ApiProvider ADD COLUMN secretKey TEXT;
ALTER TABLE ApiProvider ADD COLUMN displayName TEXT;
ALTER TABLE ApiProvider ADD COLUMN notes TEXT;
ALTER TABLE ApiProvider ADD COLUMN monthlyQuota INTEGER;

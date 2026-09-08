-- 2026-09-07: Add search rate limit log table
-- Tracks every request to /api/search/* with IP, UA, query, response status.
-- Used to identify bot patterns and tune rate limits.

CREATE TABLE IF NOT EXISTS SearchRequestLog (
  id TEXT PRIMARY KEY,
  ipAddress TEXT,
  userAgent TEXT,
  endpoint TEXT NOT NULL,           -- 'search-v2', 'search-suggest', 'search-resources'
  query TEXT,
  responseStatus INTEGER,            -- 200, 429, 500, etc.
  durationMs INTEGER,
  userId TEXT,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_searchreqlog_createdAt ON SearchRequestLog(createdAt);
CREATE INDEX IF NOT EXISTS idx_searchreqlog_ip ON SearchRequestLog(ipAddress);
CREATE INDEX IF NOT EXISTS idx_searchreqlog_endpoint ON SearchRequestLog(endpoint);
CREATE INDEX IF NOT EXISTS idx_searchreqlog_ua ON SearchRequestLog(userAgent);

-- 2026-08-24: add r2Key columns for Cloudflare R2 PDF migration
--
-- We add 3 nullable columns:
--   - Resource.r2Key       (R2 object key for the published file)
--   - TeacherFile.r2Key    (R2 object key for the teacher's original upload)
--   - TeacherFile.r2PdfKey (R2 object key for the converted PDF, if any)
--
-- These are NULL by default — no impact on Vercel (uses fileUrl as before).
-- The CF POC site will populate them via scripts/_one-off/populate-r2key.mjs
-- after this migration runs on the isolated Neon branch (examanet-cf-poc).
--
-- Schema-only change, no backfill in this migration. Backfill happens in
-- populate-r2key.mjs to keep the migration small and idempotent.

ALTER TABLE "Resource" ADD COLUMN "r2Key" TEXT;
ALTER TABLE "TeacherFile" ADD COLUMN "r2Key" TEXT;
ALTER TABLE "TeacherFile" ADD COLUMN "r2PdfKey" TEXT;

-- Add an index on Resource.r2Key for the proxy route lookups
CREATE INDEX "Resource_r2Key_idx" ON "Resource"("r2Key");

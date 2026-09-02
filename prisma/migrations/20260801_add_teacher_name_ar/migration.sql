-- Add teacherNameAr to Resource: AR prof name extracted from PDF
-- (no FK to User — just a text field for display/SEO).
ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "teacherNameAr" TEXT;

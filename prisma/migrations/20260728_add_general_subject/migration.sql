-- Add generalSubject field to ResourceMetadata for the "sujet général" extraction
ALTER TABLE "ResourceMetadata" ADD COLUMN IF NOT EXISTS "generalSubject" TEXT;

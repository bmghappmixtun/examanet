-- 2026-09-03: Phase 8 Prisma+Neon → D1 migration
-- Add columns needed for admin/teacher invitation/edit workflows
-- that Prisma had but D1 was missing.

-- ==========================================
-- USER: invitation workflow fields
-- ==========================================
ALTER TABLE User ADD COLUMN invitationStatus TEXT;
ALTER TABLE User ADD COLUMN lastInvitationId TEXT;
ALTER TABLE User ADD COLUMN mustChangePassword INTEGER DEFAULT 0;
ALTER TABLE User ADD COLUMN passwordSetAt INTEGER;
-- (invitationSentAt, invitationActivatedAt already exist in D1)

-- ==========================================
-- TeacherInvitation: full workflow fields
-- ==========================================
ALTER TABLE TeacherInvitation ADD COLUMN clickCount INTEGER DEFAULT 0;
ALTER TABLE TeacherInvitation ADD COLUMN customMessage TEXT;
ALTER TABLE TeacherInvitation ADD COLUMN tempPassword TEXT;
ALTER TABLE TeacherInvitation ADD COLUMN resendMessageId TEXT;
ALTER TABLE TeacherInvitation ADD COLUMN deliveryStatus TEXT;
ALTER TABLE TeacherInvitation ADD COLUMN deliverySyncedAt INTEGER;
ALTER TABLE TeacherInvitation ADD COLUMN activateIpAddress TEXT;
ALTER TABLE TeacherInvitation ADD COLUMN activateUserAgent TEXT;
-- message already exists

-- ==========================================
-- Resource: edit workflow fields
-- ==========================================
ALTER TABLE Resource ADD COLUMN pendingEdit TEXT;
ALTER TABLE Resource ADD COLUMN editStatus TEXT;
ALTER TABLE Resource ADD COLUMN editRequestedAt INTEGER;
ALTER TABLE Resource ADD COLUMN editRequestedById TEXT;
ALTER TABLE Resource ADD COLUMN editReviewedAt INTEGER;
ALTER TABLE Resource ADD COLUMN editReviewedById TEXT;

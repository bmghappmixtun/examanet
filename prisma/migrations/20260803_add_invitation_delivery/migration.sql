ALTER TABLE "TeacherInvitation" ADD COLUMN IF NOT EXISTS "resendMessageId" TEXT;
ALTER TABLE "TeacherInvitation" ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT;
ALTER TABLE "TeacherInvitation" ADD COLUMN IF NOT EXISTS "deliverySyncedAt" TIMESTAMP(3);
ALTER TABLE "TeacherInvitation" ADD COLUMN IF NOT EXISTS "deliveryDetail" TEXT;

CREATE INDEX IF NOT EXISTS "TeacherInvitation_resendMessageId_idx" ON "TeacherInvitation"("resendMessageId");
CREATE INDEX IF NOT EXISTS "TeacherInvitation_deliveryStatus_idx" ON "TeacherInvitation"("deliveryStatus");

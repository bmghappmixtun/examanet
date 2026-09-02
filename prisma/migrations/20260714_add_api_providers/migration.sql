-- CreateTable
CREATE TABLE IF NOT EXISTS "ApiProvider" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT,
    "publicKey" TEXT,
    "secretKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyQuota" INTEGER,
    "apiUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ApiProviderUsage" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "failedStep" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiProviderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ApiProvider_provider_key" ON "ApiProvider"("provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ApiProvider_enabled_idx" ON "ApiProvider"("enabled");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ApiProviderUsage_providerId_year_month_idx" ON "ApiProviderUsage"("providerId", "year", "month");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ApiProviderUsage_createdAt_idx" ON "ApiProviderUsage"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ApiProviderUsage_providerId_fkey') THEN
        ALTER TABLE "ApiProviderUsage" ADD CONSTRAINT "ApiProviderUsage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ApiProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

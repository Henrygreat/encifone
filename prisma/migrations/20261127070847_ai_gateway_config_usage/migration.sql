-- CreateEnum
CREATE TYPE "AIProviderType" AS ENUM ('ANTHROPIC', 'OPENAI', 'GOOGLE', 'OPENROUTER');

-- CreateTable
CREATE TABLE "AIOrganisationConfig" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "provider" "AIProviderType",
    "model" TEXT,
    "encryptedApiKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIOrganisationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageLog" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" "AIProviderType" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "succeeded" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIOrganisationConfig_organisationId_key" ON "AIOrganisationConfig"("organisationId");

-- CreateIndex
CREATE INDEX "AIUsageLog_organisationId_createdAt_idx" ON "AIUsageLog"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageLog_organisationId_feature_idx" ON "AIUsageLog"("organisationId", "feature");

-- AddForeignKey
ALTER TABLE "AIOrganisationConfig" ADD CONSTRAINT "AIOrganisationConfig_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageLog" ADD CONSTRAINT "AIUsageLog_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

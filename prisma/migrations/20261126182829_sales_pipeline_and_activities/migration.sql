-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('COMPANY', 'CONTACT', 'LEAD', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'MEETING', 'EMAIL', 'NOTE', 'TASK');

-- CreateEnum
CREATE TYPE "ActivityPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "ownerId" TEXT,
    "valueMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "probability" INTEGER,
    "expectedCloseDate" TIMESTAMP(3),
    "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "wonReason" TEXT,
    "lostReason" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityStageHistory" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMP(3),
    "priority" "ActivityPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ActivityStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "createdByUserId" TEXT,
    "opportunityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pipeline_organisationId_position_idx" ON "Pipeline"("organisationId", "position");

-- CreateIndex
CREATE INDEX "PipelineStage_pipelineId_position_idx" ON "PipelineStage"("pipelineId", "position");

-- CreateIndex
CREATE INDEX "Opportunity_organisationId_status_idx" ON "Opportunity"("organisationId", "status");

-- CreateIndex
CREATE INDEX "Opportunity_organisationId_pipelineId_stageId_position_idx" ON "Opportunity"("organisationId", "pipelineId", "stageId", "position");

-- CreateIndex
CREATE INDEX "Opportunity_organisationId_ownerId_idx" ON "Opportunity"("organisationId", "ownerId");

-- CreateIndex
CREATE INDEX "Opportunity_organisationId_deletedAt_idx" ON "Opportunity"("organisationId", "deletedAt");

-- CreateIndex
CREATE INDEX "OpportunityStageHistory_opportunityId_changedAt_idx" ON "OpportunityStageHistory"("opportunityId", "changedAt");

-- CreateIndex
CREATE INDEX "Activity_organisationId_entityType_entityId_idx" ON "Activity"("organisationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Activity_organisationId_ownerId_status_idx" ON "Activity"("organisationId", "ownerId", "status");

-- CreateIndex
CREATE INDEX "Activity_organisationId_dueAt_idx" ON "Activity"("organisationId", "dueAt");

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityStageHistory" ADD CONSTRAINT "OpportunityStageHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

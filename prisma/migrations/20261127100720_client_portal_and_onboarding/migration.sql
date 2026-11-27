-- CreateEnum
CREATE TYPE "ClientPortalUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "OnboardingStepType" AS ENUM ('WELCOME', 'CLIENT_INFO', 'PROPOSAL_ACCEPTANCE', 'CONTRACT_SIGNATURE', 'PAYMENT', 'DOCUMENT_UPLOAD', 'QUESTIONNAIRE', 'INTERNAL_REVIEW', 'SERVICE_ACTIVATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OnboardingAssignee" AS ENUM ('CLIENT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OnboardingStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DocumentUploadedByType" AS ENUM ('CLIENT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationRecipientType" AS ENUM ('MEMBERSHIP', 'CLIENT_PORTAL_USER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ONBOARDING_STEP_DUE', 'ONBOARDING_STEP_COMPLETED', 'ONBOARDING_COMPLETED', 'DOCUMENT_UPLOADED', 'DOCUMENT_REVIEWED', 'PORTAL_INVITE_SENT', 'GENERAL');

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "autoStartOnboarding" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClientPortalUser" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "status" "ClientPortalUserStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalInvite" (
    "id" TEXT NOT NULL,
    "clientPortalUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalSession" (
    "id" TEXT NOT NULL,
    "clientPortalUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplateStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "stepType" "OnboardingStepType" NOT NULL,
    "assignedTo" "OnboardingAssignee" NOT NULL DEFAULT 'CLIENT',
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "dueOffsetDays" INTEGER,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTemplateStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientOnboarding" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientOnboardingStep" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "templateStepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "stepType" "OnboardingStepType" NOT NULL,
    "assignedTo" "OnboardingAssignee" NOT NULL,
    "isMandatory" BOOLEAN NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "OnboardingStepStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB,
    "completedAt" TIMESTAMP(3),
    "completedByPortalUserId" TEXT,
    "completedByMembershipId" TEXT,
    "approvedByMembershipId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDocument" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "onboardingStepId" TEXT,
    "uploadedByType" "DocumentUploadedByType" NOT NULL,
    "uploadedByPortalUserId" TEXT,
    "uploadedByMembershipId" TEXT,
    "category" TEXT,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedByMembershipId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "recipientType" "NotificationRecipientType" NOT NULL,
    "recipientMembershipId" TEXT,
    "recipientPortalUserId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientPortalUser_organisationId_idx" ON "ClientPortalUser"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalUser_clientId_email_key" ON "ClientPortalUser"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalInvite_token_key" ON "ClientPortalInvite"("token");

-- CreateIndex
CREATE INDEX "ClientPortalInvite_clientPortalUserId_idx" ON "ClientPortalInvite"("clientPortalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalSession_tokenHash_key" ON "ClientPortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientPortalSession_clientPortalUserId_idx" ON "ClientPortalSession"("clientPortalUserId");

-- CreateIndex
CREATE INDEX "OnboardingTemplate_organisationId_deletedAt_idx" ON "OnboardingTemplate"("organisationId", "deletedAt");

-- CreateIndex
CREATE INDEX "OnboardingTemplateStep_templateId_order_idx" ON "OnboardingTemplateStep"("templateId", "order");

-- CreateIndex
CREATE INDEX "ClientOnboarding_clientId_status_idx" ON "ClientOnboarding"("clientId", "status");

-- CreateIndex
CREATE INDEX "ClientOnboardingStep_onboardingId_order_idx" ON "ClientOnboardingStep"("onboardingId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ClientDocument_storageKey_key" ON "ClientDocument"("storageKey");

-- CreateIndex
CREATE INDEX "ClientDocument_organisationId_clientId_deletedAt_idx" ON "ClientDocument"("organisationId", "clientId", "deletedAt");

-- CreateIndex
CREATE INDEX "ClientDocument_onboardingStepId_idx" ON "ClientDocument"("onboardingStepId");

-- CreateIndex
CREATE INDEX "Notification_organisationId_recipientMembershipId_readAt_idx" ON "Notification"("organisationId", "recipientMembershipId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_organisationId_recipientPortalUserId_readAt_idx" ON "Notification"("organisationId", "recipientPortalUserId", "readAt");

-- AddForeignKey
ALTER TABLE "ClientPortalUser" ADD CONSTRAINT "ClientPortalUser_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalUser" ADD CONSTRAINT "ClientPortalUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalInvite" ADD CONSTRAINT "ClientPortalInvite_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "ClientPortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalSession" ADD CONSTRAINT "ClientPortalSession_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "ClientPortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplateStep" ADD CONSTRAINT "OnboardingTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOnboarding" ADD CONSTRAINT "ClientOnboarding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOnboarding" ADD CONSTRAINT "ClientOnboarding_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOnboardingStep" ADD CONSTRAINT "ClientOnboardingStep_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "ClientOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOnboardingStep" ADD CONSTRAINT "ClientOnboardingStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "OnboardingTemplateStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOnboardingStep" ADD CONSTRAINT "ClientOnboardingStep_completedByPortalUserId_fkey" FOREIGN KEY ("completedByPortalUserId") REFERENCES "ClientPortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOnboardingStep" ADD CONSTRAINT "ClientOnboardingStep_completedByMembershipId_fkey" FOREIGN KEY ("completedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOnboardingStep" ADD CONSTRAINT "ClientOnboardingStep_approvedByMembershipId_fkey" FOREIGN KEY ("approvedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_onboardingStepId_fkey" FOREIGN KEY ("onboardingStepId") REFERENCES "ClientOnboardingStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_uploadedByPortalUserId_fkey" FOREIGN KEY ("uploadedByPortalUserId") REFERENCES "ClientPortalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_uploadedByMembershipId_fkey" FOREIGN KEY ("uploadedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_reviewedByMembershipId_fkey" FOREIGN KEY ("reviewedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientMembershipId_fkey" FOREIGN KEY ("recipientMembershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientPortalUserId_fkey" FOREIGN KEY ("recipientPortalUserId") REFERENCES "ClientPortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

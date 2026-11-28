-- CreateEnum
CREATE TYPE "InboxChannel" AS ENUM ('CHAT', 'EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InboxPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "InboxMessageKind" AS ENUM ('INBOUND', 'OUTBOUND', 'NOTE');

-- CreateTable
CREATE TABLE "InboxConversation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "channel" "InboxChannel" NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "InboxPriority" NOT NULL DEFAULT 'NORMAL',
    "subject" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "assigneeId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unread" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "snoozedUntil" TIMESTAMP(3),
    "firstReplyAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" "InboxMessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatWidget" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "welcome" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "origins" TEXT[],
    "privacyNotice" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'right',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChatWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatVisitor" (
    "id" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxConversation_organisationId_status_updatedAt_idx" ON "InboxConversation"("organisationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "InboxConversation_organisationId_assigneeId_idx" ON "InboxConversation"("organisationId", "assigneeId");

-- CreateIndex
CREATE INDEX "InboxMessage_conversationId_createdAt_id_idx" ON "InboxMessage"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMessage_conversationId_requestKey_key" ON "InboxMessage"("conversationId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatWidget_publicKey_key" ON "ChatWidget"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatWidget_organisationId_key" ON "ChatWidget"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatVisitor_conversationId_key" ON "ChatVisitor"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatVisitor_tokenHash_key" ON "ChatVisitor"("tokenHash");

-- AddForeignKey
ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatWidget" ADD CONSTRAINT "ChatWidget_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatVisitor" ADD CONSTRAINT "ChatVisitor_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "ChatWidget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatVisitor" ADD CONSTRAINT "ChatVisitor_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboxConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

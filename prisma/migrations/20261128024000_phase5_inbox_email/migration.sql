-- CreateEnum
CREATE TYPE "InboxDelivery" AS ENUM ('PENDING', 'ACCEPTED', 'DELIVERED', 'FAILED');

-- AlterTable
ALTER TABLE "InboxConversation" ADD COLUMN     "mailboxId" TEXT;

-- AlterTable
ALTER TABLE "InboxMessage" ADD COLUMN     "delivery" "InboxDelivery",
ADD COLUMN     "internetId" TEXT,
ADD COLUMN     "mailboxId" TEXT,
ADD COLUMN     "providerId" TEXT;

-- CreateTable
CREATE TABLE "InboxMailbox" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "encryptedApiKey" TEXT,
    "encryptedWebhook" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "InboxMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxMailbox_publicKey_key" ON "InboxMailbox"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMailbox_organisationId_address_key" ON "InboxMailbox"("organisationId", "address");

-- CreateIndex
CREATE INDEX "InboxMessage_mailboxId_internetId_idx" ON "InboxMessage"("mailboxId", "internetId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMessage_mailboxId_providerId_key" ON "InboxMessage"("mailboxId", "providerId");

-- AddForeignKey
ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "InboxMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "InboxMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMailbox" ADD CONSTRAINT "InboxMailbox_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

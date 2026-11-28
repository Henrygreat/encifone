-- AlterTable
ALTER TABLE "InboxConversation" ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "smsNumberId" TEXT;

-- AlterTable
ALTER TABLE "InboxMessage" ADD COLUMN     "smsNumberId" TEXT,
ADD COLUMN     "smsSegments" INTEGER;

-- CreateTable
CREATE TABLE "InboxSmsNumber" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "accountSid" TEXT NOT NULL,
    "encryptedToken" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "InboxSmsNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxSmsConsent" (
    "smsNumberId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxSmsConsent_pkey" PRIMARY KEY ("smsNumberId","recipient")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxSmsNumber_publicKey_key" ON "InboxSmsNumber"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "InboxSmsNumber_organisationId_number_key" ON "InboxSmsNumber"("organisationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "InboxMessage_smsNumberId_providerId_key" ON "InboxMessage"("smsNumberId", "providerId");

-- AddForeignKey
ALTER TABLE "InboxConversation" ADD CONSTRAINT "InboxConversation_smsNumberId_fkey" FOREIGN KEY ("smsNumberId") REFERENCES "InboxSmsNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_smsNumberId_fkey" FOREIGN KEY ("smsNumberId") REFERENCES "InboxSmsNumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxSmsNumber" ADD CONSTRAINT "InboxSmsNumber_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxSmsConsent" ADD CONSTRAINT "InboxSmsConsent_smsNumberId_fkey" FOREIGN KEY ("smsNumberId") REFERENCES "InboxSmsNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

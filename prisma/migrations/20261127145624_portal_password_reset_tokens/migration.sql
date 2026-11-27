-- CreateTable
CREATE TABLE "ClientPortalPasswordResetToken" (
    "id" TEXT NOT NULL,
    "clientPortalUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalPasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalPasswordResetToken_tokenHash_key" ON "ClientPortalPasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientPortalPasswordResetToken_clientPortalUserId_createdAt_idx" ON "ClientPortalPasswordResetToken"("clientPortalUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClientPortalPasswordResetToken" ADD CONSTRAINT "ClientPortalPasswordResetToken_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "ClientPortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD COLUMN "publicLinkNonce" TEXT, ADD COLUMN "publicLinkExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Invoice_publicLinkNonce_key" ON "Invoice"("publicLinkNonce");

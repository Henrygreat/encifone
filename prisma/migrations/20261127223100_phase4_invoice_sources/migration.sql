ALTER TABLE "Invoice" ADD COLUMN "timeEntryId" TEXT, ADD COLUMN "serviceRequestId" TEXT, ADD COLUMN "creationKey" TEXT;
CREATE UNIQUE INDEX "Invoice_organisationId_timeEntryId_key" ON "Invoice"("organisationId", "timeEntryId");
CREATE UNIQUE INDEX "Invoice_organisationId_serviceRequestId_key" ON "Invoice"("organisationId", "serviceRequestId");
CREATE UNIQUE INDEX "Invoice_organisationId_creationKey_key" ON "Invoice"("organisationId", "creationKey");

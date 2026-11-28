ALTER TABLE "Estimate" ADD COLUMN "documentSnapshot" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "purchaseOrderReference" TEXT, ADD COLUMN "customerReference" TEXT;

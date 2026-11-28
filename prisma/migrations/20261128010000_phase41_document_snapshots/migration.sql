ALTER TABLE "Organisation" ADD COLUMN "financialDocumentSettings" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "documentSnapshot" JSONB;

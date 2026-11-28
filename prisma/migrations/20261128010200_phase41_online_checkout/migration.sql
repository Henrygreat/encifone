ALTER TABLE "Organisation" ADD COLUMN "stripeInvoiceAccountId" TEXT;
CREATE UNIQUE INDEX "Organisation_stripeInvoiceAccountId_key" ON "Organisation"("stripeInvoiceAccountId");
CREATE TABLE "InvoiceCheckoutAttempt" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerSessionId" TEXT,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceCheckoutAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceCheckoutAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InvoiceCheckoutAttempt_providerSessionId_key" ON "InvoiceCheckoutAttempt"("providerSessionId");
CREATE INDEX "InvoiceCheckoutAttempt_invoiceId_closedAt_idx" ON "InvoiceCheckoutAttempt"("invoiceId", "closedAt");

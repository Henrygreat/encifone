ALTER TABLE "Payment" ADD COLUMN "refundedMinor" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "InvoicePaymentRefund" (
  "providerRefundId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePaymentRefund_pkey" PRIMARY KEY ("providerRefundId"),
  CONSTRAINT "InvoicePaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "InvoicePaymentRefund_paymentId_idx" ON "InvoicePaymentRefund"("paymentId");

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "bufferedUntil" TIMESTAMP(3) NOT NULL,
    "bufferMinutes" INTEGER NOT NULL,
    "reminderAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "conversationId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "leadId" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Appointment_organisationId_staffId_startsAt_idx" ON "Appointment"("organisationId", "staffId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_remindedAt_reminderAt_idx" ON "Appointment"("remindedAt", "reminderAt");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "ChatWidget_organisationId_key";

-- AlterTable
ALTER TABLE "ChatWidget" ADD COLUMN     "lastConnectedAt" TIMESTAMP(3),
ADD COLUMN     "lastConnectedOrigin" TEXT,
ADD COLUMN     "widgetName" TEXT;

-- CreateIndex
CREATE INDEX "ChatWidget_organisationId_idx" ON "ChatWidget"("organisationId");

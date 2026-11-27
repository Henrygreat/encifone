-- CreateEnum
CREATE TYPE "ServiceCommercialModel" AS ENUM ('FIXED_PRICE', 'HOURLY', 'RECURRING', 'CUSTOM_QUOTATION');

-- CreateEnum
CREATE TYPE "ServicePackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "ServiceBillingType" ADD VALUE 'HOURLY';

-- AlterEnum
ALTER TYPE "ServiceItemStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "ServiceItem" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "commercialModel" "ServiceCommercialModel" NOT NULL DEFAULT 'FIXED_PRICE',
ADD COLUMN     "deliverables" TEXT,
ADD COLUMN     "documentRequirements" JSONB,
ADD COLUMN     "estimatedDeliveryDays" INTEGER,
ADD COLUMN     "internalCostMinor" INTEGER,
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboardingRequirements" JSONB,
ADD COLUMN     "projectTemplate" JSONB,
ADD COLUMN     "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "slaSummary" TEXT,
ADD COLUMN     "taskTemplate" JSONB;

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceDependency" (
    "id" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "dependsOnServiceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ServicePackageStatus" NOT NULL DEFAULT 'DRAFT',
    "fixedPriceMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "estimatedDeliveryDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackageItem" (
    "id" TEXT NOT NULL,
    "servicePackageId" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServicePackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItemClientLink" (
    "id" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceItemClientLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItemContractLink" (
    "id" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceItemContractLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCatalogueSavedView" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCatalogueSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCategory_organisationId_sortOrder_idx" ON "ServiceCategory"("organisationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategory_organisationId_name_key" ON "ServiceCategory"("organisationId", "name");

-- CreateIndex
CREATE INDEX "ServiceDependency_dependsOnServiceId_idx" ON "ServiceDependency"("dependsOnServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceDependency_serviceItemId_dependsOnServiceId_key" ON "ServiceDependency"("serviceItemId", "dependsOnServiceId");

-- CreateIndex
CREATE INDEX "ServicePackage_organisationId_status_idx" ON "ServicePackage"("organisationId", "status");

-- CreateIndex
CREATE INDEX "ServicePackage_organisationId_categoryId_idx" ON "ServicePackage"("organisationId", "categoryId");

-- CreateIndex
CREATE INDEX "ServicePackageItem_servicePackageId_position_idx" ON "ServicePackageItem"("servicePackageId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePackageItem_servicePackageId_serviceItemId_key" ON "ServicePackageItem"("servicePackageId", "serviceItemId");

-- CreateIndex
CREATE INDEX "ServiceItemClientLink_clientId_idx" ON "ServiceItemClientLink"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceItemClientLink_serviceItemId_clientId_key" ON "ServiceItemClientLink"("serviceItemId", "clientId");

-- CreateIndex
CREATE INDEX "ServiceItemContractLink_contractId_idx" ON "ServiceItemContractLink"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceItemContractLink_serviceItemId_contractId_key" ON "ServiceItemContractLink"("serviceItemId", "contractId");

-- CreateIndex
CREATE INDEX "ServiceCatalogueSavedView_organisationId_idx" ON "ServiceCatalogueSavedView"("organisationId");

-- CreateIndex
CREATE INDEX "ServiceItem_organisationId_categoryId_idx" ON "ServiceItem"("organisationId", "categoryId");

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDependency" ADD CONSTRAINT "ServiceDependency_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDependency" ADD CONSTRAINT "ServiceDependency_dependsOnServiceId_fkey" FOREIGN KEY ("dependsOnServiceId") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackage" ADD CONSTRAINT "ServicePackage_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_servicePackageId_fkey" FOREIGN KEY ("servicePackageId") REFERENCES "ServicePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePackageItem" ADD CONSTRAINT "ServicePackageItem_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItemClientLink" ADD CONSTRAINT "ServiceItemClientLink_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItemClientLink" ADD CONSTRAINT "ServiceItemClientLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItemContractLink" ADD CONSTRAINT "ServiceItemContractLink_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItemContractLink" ADD CONSTRAINT "ServiceItemContractLink_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCatalogueSavedView" ADD CONSTRAINT "ServiceCatalogueSavedView_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCatalogueSavedView" ADD CONSTRAINT "ServiceCatalogueSavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

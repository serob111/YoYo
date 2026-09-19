-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "RentBillingPeriod" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "FinancingType" AS ENUM ('CASH', 'MORTGAGE');

-- CreateEnum
CREATE TYPE "PurchaseTimeframe" AS ENUM ('IMMEDIATE', 'WITHIN_3_MONTHS', 'WITHIN_6_MONTHS', 'FLEXIBLE');

-- DropIndex
DROP INDEX "buyer_preferences_contactId_key";

-- AlterTable
ALTER TABLE "buyer_preferences" ADD COLUMN     "financingType" "FinancingType",
ADD COLUMN     "furnished" BOOLEAN,
ADD COLUMN     "hasPets" BOOLEAN,
ADD COLUMN     "leaseDurationMonths" INTEGER,
ADD COLUMN     "moveInDate" TIMESTAMP(3),
ADD COLUMN     "occupantCount" INTEGER,
ADD COLUMN     "purchaseTimeframe" "PurchaseTimeframe",
ADD COLUMN     "transactionType" "TransactionType" NOT NULL DEFAULT 'SALE';

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "depositCents" INTEGER,
ADD COLUMN     "minRentalPeriodDays" INTEGER,
ADD COLUMN     "rentBillingPeriod" "RentBillingPeriod",
ADD COLUMN     "transactionType" "TransactionType" NOT NULL DEFAULT 'SALE';

-- CreateIndex
CREATE UNIQUE INDEX "buyer_preferences_contactId_transactionType_key" ON "buyer_preferences"("contactId", "transactionType");


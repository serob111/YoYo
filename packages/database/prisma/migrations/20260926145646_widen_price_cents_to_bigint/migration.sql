-- AlterTable
ALTER TABLE "buyer_preferences" ALTER COLUMN "minPriceCents" SET DATA TYPE BIGINT,
ALTER COLUMN "maxPriceCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "properties" ALTER COLUMN "priceCents" SET DATA TYPE BIGINT,
ALTER COLUMN "depositCents" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "property_import_candidates" ALTER COLUMN "priceCents" SET DATA TYPE BIGINT;

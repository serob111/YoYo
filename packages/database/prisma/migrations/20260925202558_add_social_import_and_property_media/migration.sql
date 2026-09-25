-- CreateEnum
CREATE TYPE "SocialMediaType" AS ENUM ('IMAGE', 'VIDEO', 'REEL', 'CAROUSEL');

-- CreateEnum
CREATE TYPE "SocialMediaAnalysisStatus" AS ENUM ('PENDING', 'ANALYZING', 'ANALYZED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SocialMediaImportStatus" AS ENUM ('DISCOVERED', 'ANALYZED', 'CANDIDATE', 'LINKED', 'IGNORED');

-- CreateEnum
CREATE TYPE "PropertyImportCandidateStatus" AS ENUM ('PENDING_REVIEW', 'IMPORTED', 'LINKED_EXISTING', 'IGNORED');

-- CreateEnum
CREATE TYPE "PropertyMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'FLOORPLAN', 'OTHER');

-- CreateEnum
CREATE TYPE "PropertyMediaSource" AS ENUM ('MANUAL', 'INSTAGRAM', 'TIKTOK');

-- CreateEnum
CREATE TYPE "SocialSyncType" AS ENUM ('INITIAL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "SocialSyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "formattedAddress" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "region" TEXT;

-- CreateTable
CREATE TABLE "social_media_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "providerMediaId" TEXT NOT NULL,
    "mediaType" "SocialMediaType" NOT NULL,
    "caption" TEXT,
    "permalink" TEXT,
    "postedAt" TIMESTAMP(3),
    "thumbnailUrl" TEXT,
    "primaryMediaUrl" TEXT,
    "providerMetadata" JSONB NOT NULL DEFAULT '{}',
    "analysisStatus" "SocialMediaAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "analysisResult" JSONB,
    "isPropertyRelated" BOOLEAN,
    "analysisConfidence" DOUBLE PRECISION,
    "candidateId" TEXT,
    "propertyId" TEXT,
    "importStatus" "SocialMediaImportStatus" NOT NULL DEFAULT 'DISCOVERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_media_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_media_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "socialMediaItemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "MediaAssetKind" NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "providerChildId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_import_candidates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "status" "PropertyImportCandidateStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "confidence" DOUBLE PRECISION NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "country" TEXT,
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "areaSqm" DOUBLE PRECISION,
    "availabilityHint" TEXT,
    "possibleExistingPropertyId" TEXT,
    "importedPropertyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,

    CONSTRAINT "property_import_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_media" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" "PropertyMediaKind" NOT NULL,
    "storageKey" TEXT,
    "externalUrl" TEXT,
    "source" "PropertyMediaSource" NOT NULL DEFAULT 'MANUAL',
    "sourceSocialMediaItemId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_syncs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "type" "SocialSyncType" NOT NULL DEFAULT 'INITIAL',
    "status" "SocialSyncStatus" NOT NULL DEFAULT 'QUEUED',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "propertyRelatedItems" INTEGER NOT NULL DEFAULT 0,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_media_items_organizationId_importStatus_idx" ON "social_media_items"("organizationId", "importStatus");

-- CreateIndex
CREATE INDEX "social_media_items_candidateId_idx" ON "social_media_items"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "social_media_items_connectedAccountId_providerMediaId_key" ON "social_media_items"("connectedAccountId", "providerMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "social_media_assets_socialMediaItemId_position_key" ON "social_media_assets"("socialMediaItemId", "position");

-- CreateIndex
CREATE INDEX "property_import_candidates_organizationId_status_idx" ON "property_import_candidates"("organizationId", "status");

-- CreateIndex
CREATE INDEX "property_media_organizationId_propertyId_idx" ON "property_media"("organizationId", "propertyId");

-- CreateIndex
CREATE INDEX "social_syncs_organizationId_connectedAccountId_createdAt_idx" ON "social_syncs"("organizationId", "connectedAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "social_media_items" ADD CONSTRAINT "social_media_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_media_items" ADD CONSTRAINT "social_media_items_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_media_items" ADD CONSTRAINT "social_media_items_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "property_import_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_media_items" ADD CONSTRAINT "social_media_items_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_media_assets" ADD CONSTRAINT "social_media_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_media_assets" ADD CONSTRAINT "social_media_assets_socialMediaItemId_fkey" FOREIGN KEY ("socialMediaItemId") REFERENCES "social_media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_import_candidates" ADD CONSTRAINT "property_import_candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_import_candidates" ADD CONSTRAINT "property_import_candidates_possibleExistingPropertyId_fkey" FOREIGN KEY ("possibleExistingPropertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_import_candidates" ADD CONSTRAINT "property_import_candidates_importedPropertyId_fkey" FOREIGN KEY ("importedPropertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_sourceSocialMediaItemId_fkey" FOREIGN KEY ("sourceSocialMediaItemId") REFERENCES "social_media_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_syncs" ADD CONSTRAINT "social_syncs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_syncs" ADD CONSTRAINT "social_syncs_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

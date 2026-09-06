-- CreateEnum
CREATE TYPE "ContentPostType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL');

-- CreateEnum
CREATE TYPE "ContentItemStatus" AS ENUM ('DRAFT', 'GENERATING', 'GENERATION_FAILED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHING', 'PUBLISHED', 'PUBLISH_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaAssetKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('UPLOADED', 'ENHANCING', 'ENHANCED', 'ENHANCEMENT_FAILED');

-- AlterEnum
ALTER TYPE "Provider" ADD VALUE 'TIKTOK';

-- AlterTable
ALTER TABLE "business_profiles" ADD COLUMN     "autoPublishEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "postType" "ContentPostType" NOT NULL,
    "caption" TEXT,
    "captionPrompt" TEXT,
    "generationError" TEXT,
    "status" "ContentItemStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "autoApproved" BOOLEAN NOT NULL DEFAULT false,
    "submittedForApprovalAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectionReason" TEXT,
    "createdByUserId" TEXT,
    "providerContainerId" TEXT,
    "providerPostId" TEXT,
    "publishAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "publishErrorMessage" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_media_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "MediaAssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalStorageKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'UPLOADED',
    "enhancementPrompt" TEXT,
    "enhancementError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_items_organizationId_status_scheduledFor_idx" ON "content_items"("organizationId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "content_items_organizationId_createdAt_idx" ON "content_items"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "content_media_assets_organizationId_idx" ON "content_media_assets"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "content_media_assets_contentItemId_order_key" ON "content_media_assets"("contentItemId", "order");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "connected_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_rejectedByUserId_fkey" FOREIGN KEY ("rejectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media_assets" ADD CONSTRAINT "content_media_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media_assets" ADD CONSTRAINT "content_media_assets_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

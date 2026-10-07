-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "propertyId" TEXT;

-- CreateIndex
CREATE INDEX "content_items_organizationId_propertyId_idx" ON "content_items"("organizationId", "propertyId");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

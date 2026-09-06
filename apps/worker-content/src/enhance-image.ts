import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@yoyo/database";
import type { ImageEditProvider } from "@yoyo/ai";
import type { StorageClient } from "@yoyo/storage";

export type EnhanceImageResult = "enhanced" | "skipped" | "not_found" | "failed";

/**
 * Same claim-then-terminal-fail model as generate-caption.ts: a failure
 * lands the asset in ENHANCEMENT_FAILED for the human to retry explicitly
 * via a fresh POST .../media/:id/enhance, rather than relying on a BullMQ
 * auto-retry racing the claim.
 */
export async function enhanceImage(
  prisma: PrismaClient,
  storage: StorageClient,
  imageEditProvider: ImageEditProvider,
  mediaAssetId: string,
  instruction: string
): Promise<EnhanceImageResult> {
  const claimed = await prisma.contentMediaAsset.updateMany({
    where: { id: mediaAssetId, status: { in: ["UPLOADED", "ENHANCEMENT_FAILED"] } },
    data: { status: "ENHANCING" }
  });
  if (claimed.count === 0) return "skipped";

  const asset = await prisma.contentMediaAsset.findUnique({ where: { id: mediaAssetId } });
  if (!asset) return "not_found";

  try {
    const originalBytes = await storage.getObject(asset.storageKey);
    const result = await imageEditProvider.edit(originalBytes, asset.mimeType, instruction);

    const ext = result.mimeType.split("/")[1] ?? "bin";
    const newKey = `orgs/${asset.organizationId}/content/${randomUUID()}.${ext}`;
    await storage.putObject(newKey, result.data, result.mimeType);

    await prisma.contentMediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        status: "ENHANCED",
        storageKey: newKey,
        originalStorageKey: asset.originalStorageKey ?? asset.storageKey,
        mimeType: result.mimeType,
        byteSize: result.data.length,
        enhancementPrompt: instruction,
        enhancementError: null
      }
    });
    return "enhanced";
  } catch (error) {
    await prisma.contentMediaAsset.update({
      where: { id: mediaAssetId },
      data: { status: "ENHANCEMENT_FAILED", enhancementError: error instanceof Error ? error.message : String(error) }
    });
    return "failed";
  }
}

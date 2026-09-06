import type { PrismaClient, Provider } from "@yoyo/database";
import type { TokenEncryptionService } from "@yoyo/crypto";
import { ProviderApiError, type MediaRef, type PublishingProvider } from "@yoyo/integrations";
import type { StorageClient } from "@yoyo/storage";

export type PublishContentResult = "published" | "skipped" | "not_found" | "failed";

/**
 * Exported as a plain function, same convention as sendPendingMessage
 * (apps/worker-messaging/src/send.ts) - both the worker entrypoint and tests
 * call it directly. Atomic claim (APPROVED -> PUBLISHING) is the
 * duplicate-publish-prevention exit criterion: two concurrent calls for the
 * same contentItemId race on this updateMany, only one gets count=1.
 */
export async function publishContentItem(
  prisma: PrismaClient,
  storage: StorageClient,
  tokenEncryption: TokenEncryptionService,
  resolvePublishingProvider: (provider: Provider) => PublishingProvider,
  contentItemId: string
): Promise<PublishContentResult> {
  const claimed = await prisma.contentItem.updateMany({
    where: { id: contentItemId, status: "APPROVED" },
    data: { status: "PUBLISHING", publishAttemptCount: { increment: 1 } }
  });
  if (claimed.count === 0) return "skipped";

  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId }, include: { media: { orderBy: { order: "asc" } } } });
  if (!item) return "not_found";

  const connectedAccount = await prisma.connectedAccount.findUnique({ where: { id: item.connectedAccountId } });
  if (!connectedAccount || connectedAccount.status !== "CONNECTED") {
    await prisma.contentItem.update({ where: { id: contentItemId }, data: { status: "PUBLISH_FAILED", publishErrorMessage: "Connected account is not currently able to publish. Reconnect it first." } });
    return "failed";
  }

  const accessToken = tokenEncryption.decrypt(connectedAccount.encryptedAccessToken);
  const account = { externalAccountId: connectedAccount.externalAccountId, accessToken };
  const publishingProvider = resolvePublishingProvider(item.provider);

  try {
    const mediaRefs = await Promise.all(item.media.map((asset) => buildMediaRef(storage, item.provider, asset)));

    const result =
      item.postType === "CAROUSEL"
        ? await publishingProvider.publishCarousel(account, mediaRefs, item.caption ?? "")
        : item.postType === "VIDEO"
          ? await publishingProvider.publishVideo(account, mediaRefs[0]!, item.caption ?? "")
          : await publishingProvider.publishImage(account, mediaRefs[0]!, item.caption ?? "");

    await prisma.$transaction(async (tx) => {
      await tx.contentItem.update({
        where: { id: contentItemId },
        data: { status: "PUBLISHED", providerPostId: result.externalPostId, publishedAt: new Date() }
      });
      if (item.autoApproved) {
        // Inlined rather than importing apps/api's AuditService - same "worker
        // does its own tenant-scoped writes" convention as worker-automations.
        await tx.auditLog.create({
          data: {
            organizationId: item.organizationId,
            actorId: null,
            action: "content.auto_published",
            entityType: "ContentItem",
            entityId: contentItemId,
            metadata: { provider: item.provider, postType: item.postType, externalPostId: result.externalPostId },
            requestId: "worker-publishing"
          }
        });
      }
    });
    return "published";
  } catch (error) {
    return handlePublishFailure(prisma, contentItemId, connectedAccount.id, error);
  }
}

async function buildMediaRef(storage: StorageClient, provider: "INSTAGRAM" | "TIKTOK", asset: { kind: "IMAGE" | "VIDEO"; mimeType: string; storageKey: string }): Promise<MediaRef> {
  // TikTok video uses FILE_UPLOAD (raw bytes, no public URL needed) - every
  // other combination (Instagram anything, TikTok photo) needs a publicly
  // reachable URL, which is the documented local-MinIO limitation (see
  // docs/adr/0007). getPresignedDownloadUrl works against a real public S3
  // bucket/CDN; it's not reachable by Meta/TikTok's servers against local MinIO.
  if (provider === "TIKTOK" && asset.kind === "VIDEO") {
    const bytes = await storage.getObject(asset.storageKey);
    return { bytes, mimeType: asset.mimeType, kind: asset.kind };
  }
  const url = await storage.getPresignedDownloadUrl(asset.storageKey);
  return { url, mimeType: asset.mimeType, kind: asset.kind };
}

async function handlePublishFailure(prisma: PrismaClient, contentItemId: string, connectedAccountId: string, error: unknown): Promise<PublishContentResult> {
  if (!(error instanceof ProviderApiError)) {
    // Unclassified error (e.g. a bug, or a storage failure) - revert to
    // APPROVED and rethrow so BullMQ retries with backoff, same as
    // sendPendingMessage's default branch.
    await prisma.contentItem.update({ where: { id: contentItemId }, data: { status: "APPROVED" } });
    throw error;
  }

  switch (error.category) {
    case "RETRYABLE":
      await prisma.contentItem.update({ where: { id: contentItemId }, data: { status: "APPROVED" } });
      throw error;

    case "ACTION_REQUIRED":
      await prisma.$transaction([
        prisma.contentItem.update({ where: { id: contentItemId }, data: { status: "PUBLISH_FAILED", publishErrorMessage: error.message } }),
        prisma.connectedAccount.update({
          where: { id: connectedAccountId },
          data: { status: "ACTION_REQUIRED", lastErrorCode: String(error.providerErrorCode ?? error.httpStatus ?? ""), lastErrorAt: new Date() }
        })
      ]);
      return "failed";

    case "NON_RETRYABLE":
      await prisma.contentItem.update({ where: { id: contentItemId }, data: { status: "PUBLISH_FAILED", publishErrorMessage: error.message } });
      return "failed";

    case "REQUIRES_RECONCILIATION":
      // Ambiguous outcome (e.g. timeout after the request may have already
      // reached the provider) - never blindly re-publish. Terminal
      // PUBLISH_FAILED + flagged for manual review is the conservative choice.
      await prisma.contentItem.update({
        where: { id: contentItemId },
        data: { status: "PUBLISH_FAILED", publishErrorMessage: error.message, metadata: { requiresReconciliation: true } }
      });
      return "failed";

    default: {
      const exhaustiveCheck: never = error.category;
      throw new Error(`Unknown provider failure category: ${exhaustiveCheck}`);
    }
  }
}

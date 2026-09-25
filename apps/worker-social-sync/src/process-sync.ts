import type { PrismaClient } from "@yoyo/database";
import type { TokenEncryptionService } from "@yoyo/crypto";
import type { AIProvider } from "@yoyo/ai";
import type { SocialMediaReaderProvider } from "@yoyo/integrations";
import { toSocialMediaAssetsUpsertData, toSocialMediaItemUpsertData } from "./normalize-media";
import { extractListingSignals, type ListingExtraction } from "./listing-extraction";
import { groupListings, type GroupableItem } from "./grouping";

export type ProcessSyncResult = "completed" | "partial" | "failed" | "skipped" | "not_found";

const MAX_PAGES = 10;

/**
 * Exported as a plain function (not tied to BullMQ) so both the worker
 * entrypoint and integration tests can call it directly - mirrors
 * normalizeWebhookEvent/generateAiReply's convention. The atomic claim below
 * (QUEUED -> RUNNING) makes two concurrent attempts at the same SocialSync
 * row safe; DB unique constraints on SocialMediaItem/SocialMediaAsset are
 * the final dedup authority for re-running "Scan Instagram" as a brand new
 * SocialSync row against media already seen in a prior sync.
 */
export async function processSocialSync(
  deps: {
    prisma: PrismaClient;
    tokenEncryption: TokenEncryptionService;
    // Keyed by ConnectedAccount.provider - only "INSTAGRAM" has a real
    // implementation today (InstagramMediaReaderProvider). A provider with
    // no entry here fails the sync with a clear message rather than a crash.
    mediaReaders: Partial<Record<"INSTAGRAM" | "TIKTOK", SocialMediaReaderProvider>>;
    aiProvider: AIProvider;
    aiModel: string;
  },
  socialSyncId: string
): Promise<ProcessSyncResult> {
  const { prisma, tokenEncryption, mediaReaders, aiProvider, aiModel } = deps;

  const claimed = await prisma.socialSync.updateMany({
    where: { id: socialSyncId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() }
  });
  if (claimed.count === 0) return "skipped";

  const sync = await prisma.socialSync.findUnique({ where: { id: socialSyncId } });
  if (!sync) return "not_found";

  const connectedAccount = await prisma.connectedAccount.findUnique({ where: { id: sync.connectedAccountId } });
  if (!connectedAccount) {
    await prisma.socialSync.update({ where: { id: socialSyncId }, data: { status: "FAILED", lastError: "ConnectedAccount not found", completedAt: new Date() } });
    return "failed";
  }

  const mediaReader = mediaReaders[connectedAccount.provider];
  if (!mediaReader) {
    await prisma.socialSync.update({
      where: { id: socialSyncId },
      data: { status: "FAILED", lastError: `No media-read support for provider ${connectedAccount.provider} yet`, completedAt: new Date() }
    });
    return "failed";
  }

  const accessToken = tokenEncryption.decrypt(connectedAccount.encryptedAccessToken);
  const accountRef = { externalAccountId: connectedAccount.externalAccountId, accessToken };

  let totalItems = 0;
  let processedItems = 0;
  let errorCount = 0;
  const newlyDiscoveredIds: string[] = [];

  try {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await mediaReader.listMedia(accountRef, cursor);
      totalItems += result.items.length;

      for (const raw of result.items) {
        const itemData = toSocialMediaItemUpsertData(raw, sync.organizationId, connectedAccount.id, connectedAccount.provider);
        const item = await prisma.socialMediaItem.upsert({
          where: { connectedAccountId_providerMediaId: { connectedAccountId: connectedAccount.id, providerMediaId: raw.providerMediaId } },
          create: { ...itemData, providerMetadata: itemData.providerMetadata as object, lastSyncedAt: new Date() },
          update: {
            caption: itemData.caption,
            permalink: itemData.permalink,
            thumbnailUrl: itemData.thumbnailUrl,
            primaryMediaUrl: itemData.primaryMediaUrl,
            providerMetadata: itemData.providerMetadata as object,
            lastSyncedAt: new Date()
            // importStatus/analysisStatus/candidateId/propertyId are never
            // touched on update - a re-sync must not resurrect an IGNORED or
            // LINKED item, or reset analysis already performed.
          }
        });

        const assets = toSocialMediaAssetsUpsertData(raw);
        for (const asset of assets) {
          await prisma.socialMediaAsset.upsert({
            where: { socialMediaItemId_position: { socialMediaItemId: item.id, position: asset.position } },
            create: { organizationId: sync.organizationId, socialMediaItemId: item.id, ...asset },
            update: { mediaUrl: asset.mediaUrl, thumbnailUrl: asset.thumbnailUrl, kind: asset.kind }
          });
        }

        if (item.analysisStatus === "PENDING") {
          newlyDiscoveredIds.push(item.id);
        }
        processedItems++;
      }

      await prisma.socialSync.update({ where: { id: socialSyncId }, data: { totalItems, processedItems } });

      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
  } catch (error) {
    await prisma.socialSync.update({
      where: { id: socialSyncId },
      data: { status: "FAILED", totalItems, processedItems, lastError: error instanceof Error ? error.message : String(error), completedAt: new Date() }
    });
    return "failed";
  }

  // Analysis: one AI call per newly-discovered item. Sequential - the import
  // dataset is small (dozens of items, not thousands) and this keeps rate
  // limiting/backoff out of scope for the MVP.
  const analyzed: GroupableItem[] = [];
  for (const itemId of newlyDiscoveredIds) {
    const item = await prisma.socialMediaItem.findUnique({ where: { id: itemId } });
    if (!item) continue;
    await prisma.socialMediaItem.update({ where: { id: itemId }, data: { analysisStatus: "ANALYZING" } });

    let extraction: ListingExtraction | null = null;
    try {
      extraction = await extractListingSignals(aiProvider, aiModel, { caption: item.caption, mediaType: item.mediaType, postedAt: item.postedAt });
    } catch {
      extraction = null;
    }

    if (!extraction) {
      errorCount++;
      await prisma.socialMediaItem.update({ where: { id: itemId }, data: { analysisStatus: "FAILED" } });
      continue;
    }

    await prisma.socialMediaItem.update({
      where: { id: itemId },
      data: {
        analysisStatus: "ANALYZED",
        analysisResult: extraction as unknown as object,
        isPropertyRelated: extraction.isPropertyRelated,
        analysisConfidence: extraction.confidence,
        importStatus: extraction.isPropertyRelated ? "ANALYZED" : "IGNORED"
      }
    });

    if (extraction.isPropertyRelated) {
      analyzed.push({ id: itemId, extraction });
    }
  }

  // Grouping: only items freshly analyzed this run that are property-related
  // and not already attached to a candidate (a re-sync's newlyDiscoveredIds
  // are, by construction, items that had no prior candidate).
  const groups = groupListings(analyzed);
  let candidateCount = 0;
  for (const group of groups) {
    const merged = group.merged;
    if (!merged.transactionType || !merged.propertyType || !merged.title) continue; // not enough to propose a candidate

    const possibleExisting = await findPossibleExistingProperty(prisma, sync.organizationId, merged);

    const candidate = await prisma.propertyImportCandidate.create({
      data: {
        organizationId: sync.organizationId,
        connectedAccountId: connectedAccount.id,
        confidence: group.confidence,
        transactionType: merged.transactionType,
        propertyType: merged.propertyType,
        title: merged.title,
        description: merged.description,
        priceCents: merged.price != null ? Math.round(merged.price * 100) : null,
        currency: merged.currency ?? "USD",
        country: merged.country,
        city: merged.city,
        district: merged.district,
        address: merged.address,
        bedrooms: merged.bedrooms,
        bathrooms: merged.bathrooms,
        areaSqm: merged.areaSqm,
        availabilityHint: merged.availabilityHint,
        possibleExistingPropertyId: possibleExisting?.id ?? null
      }
    });
    candidateCount++;

    await prisma.socialMediaItem.updateMany({
      where: { id: { in: group.itemIds } },
      data: { candidateId: candidate.id, importStatus: "CANDIDATE" }
    });
  }

  const propertyRelatedItems = await prisma.socialMediaItem.count({ where: { connectedAccountId: connectedAccount.id, isPropertyRelated: true } });

  const finalStatus = errorCount === 0 ? "COMPLETED" : processedItems > errorCount ? "PARTIAL" : "FAILED";
  await prisma.socialSync.update({
    where: { id: socialSyncId },
    data: {
      status: finalStatus,
      totalItems,
      processedItems,
      propertyRelatedItems,
      candidateCount,
      errorCount,
      completedAt: new Date()
    }
  });

  return finalStatus === "COMPLETED" ? "completed" : finalStatus === "PARTIAL" ? "partial" : "failed";
}

// Best-effort match against Properties already in the org (manually created
// or previously imported) - never auto-merges, only sets
// possibleExistingPropertyId for the review UI's "Link to existing" prompt.
async function findPossibleExistingProperty(prisma: PrismaClient, organizationId: string, extraction: ListingExtraction) {
  if (!extraction.city || !extraction.transactionType || !extraction.propertyType) return null;
  return prisma.property.findFirst({
    where: {
      organizationId,
      transactionType: extraction.transactionType,
      propertyType: extraction.propertyType,
      city: { equals: extraction.city, mode: "insensitive" },
      ...(extraction.district ? { district: { equals: extraction.district, mode: "insensitive" } } : {}),
      ...(extraction.bedrooms != null ? { bedrooms: extraction.bedrooms } : {})
    },
    orderBy: { createdAt: "desc" }
  });
}

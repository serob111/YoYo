import { Injectable } from "@nestjs/common";
import type {
  ImportPropertyImportCandidateInput,
  LinkPropertyImportCandidateInput,
  UpdatePropertyImportCandidateInput
} from "@yoyo/contracts";
import type { Prisma, PropertyImportCandidateStatus } from "@yoyo/database";
import { PrismaService } from "../common/prisma.service";
import { OutboxService } from "../common/outbox.service";
import { RequestContext } from "../common/request-context";
import { NotFoundDomainError, ConflictDomainError } from "../common/domain-errors";

@Injectable()
export class SocialImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  async startSync(organizationId: string, connectedAccountId: string) {
    const account = await this.prisma.client.connectedAccount.findUnique({ where: { id: connectedAccountId } });
    if (!account || account.organizationId !== organizationId) throw new NotFoundDomainError("Connected account");

    const requestId = RequestContext.current()?.requestId ?? "api";

    return this.prisma.client.$transaction(async (tx) => {
      const existingCount = await tx.socialSync.count({ where: { connectedAccountId } });
      const sync = await tx.socialSync.create({
        data: {
          organizationId,
          connectedAccountId,
          type: existingCount > 0 ? "INCREMENTAL" : "INITIAL"
        }
      });

      await this.outbox.record(tx, {
        organizationId,
        aggregateType: "SocialSync",
        aggregateId: sync.id,
        eventType: "social_sync.requested",
        payload: { requestId, connectedAccountId }
      });

      return sync;
    });
  }

  async getSync(organizationId: string, syncId: string) {
    const sync = await this.prisma.client.socialSync.findUnique({ where: { id: syncId } });
    if (!sync || sync.organizationId !== organizationId) throw new NotFoundDomainError("Social sync");
    return sync;
  }

  async getLatestSync(organizationId: string, connectedAccountId: string) {
    return this.prisma.client.socialSync.findFirst({
      where: { organizationId, connectedAccountId },
      orderBy: { createdAt: "desc" }
    });
  }

  async listCandidates(organizationId: string, filters: { status?: PropertyImportCandidateStatus; connectedAccountId?: string }) {
    const candidates = await this.prisma.client.propertyImportCandidate.findMany({
      where: {
        organizationId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.connectedAccountId ? { connectedAccountId: filters.connectedAccountId } : {})
      },
      include: { items: true, possibleExistingProperty: { select: { title: true } } },
      orderBy: { createdAt: "desc" }
    });
    return candidates.map(this.toCandidateDto);
  }

  async getCandidate(organizationId: string, candidateId: string) {
    const candidate = await this.getCandidateForReviewOrThrow(organizationId, candidateId);
    return this.toCandidateDto(candidate);
  }

  async updateCandidate(organizationId: string, candidateId: string, input: UpdatePropertyImportCandidateInput) {
    const existing = await this.getCandidateOrThrow(organizationId, candidateId);
    if (existing.status !== "PENDING_REVIEW") {
      throw new ConflictDomainError("Only a pending-review candidate can be edited.");
    }
    await this.prisma.client.propertyImportCandidate.update({ where: { id: candidateId }, data: input });
    return this.getCandidate(organizationId, candidateId);
  }

  async importCandidate(organizationId: string, candidateId: string, userId: string, input: ImportPropertyImportCandidateInput) {
    const candidate = await this.getCandidateWithMediaOrThrow(organizationId, candidateId);
    if (candidate.status !== "PENDING_REVIEW") {
      throw new ConflictDomainError(`This candidate is already ${candidate.status.toLowerCase().replace("_", " ")}.`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          organizationId,
          title: candidate.title,
          description: candidate.description,
          propertyType: candidate.propertyType,
          status: input.status,
          transactionType: candidate.transactionType,
          priceCents: candidate.priceCents,
          currency: candidate.currency,
          country: candidate.country,
          city: candidate.city,
          district: candidate.district,
          address: candidate.address,
          bedrooms: candidate.bedrooms,
          bathrooms: candidate.bathrooms,
          areaSqm: candidate.areaSqm
        }
      });

      await this.attachCandidateMedia(tx, organizationId, property.id, candidate);

      await tx.propertyImportCandidate.update({
        where: { id: candidateId },
        data: { status: "IMPORTED", importedPropertyId: property.id, reviewedAt: new Date(), reviewedByUserId: userId }
      });
      await tx.socialMediaItem.updateMany({
        where: { candidateId },
        data: { importStatus: "LINKED", propertyId: property.id }
      });

      if (property.status === "ACTIVE") {
        await this.outbox.record(tx, {
          organizationId,
          aggregateType: "Property",
          aggregateId: property.id,
          eventType: "property.activated",
          payload: { requestId: RequestContext.current()?.requestId ?? "api" }
        });
      }

      return property;
    });
  }

  async linkCandidate(organizationId: string, candidateId: string, userId: string, input: LinkPropertyImportCandidateInput) {
    const candidate = await this.getCandidateWithMediaOrThrow(organizationId, candidateId);
    if (candidate.status !== "PENDING_REVIEW") {
      throw new ConflictDomainError(`This candidate is already ${candidate.status.toLowerCase().replace("_", " ")}.`);
    }
    const property = await this.prisma.client.property.findUnique({ where: { id: input.propertyId } });
    if (!property || property.organizationId !== organizationId) throw new NotFoundDomainError("Property");

    return this.prisma.client.$transaction(async (tx) => {
      await this.attachCandidateMedia(tx, organizationId, property.id, candidate);

      await tx.propertyImportCandidate.update({
        where: { id: candidateId },
        data: { status: "LINKED_EXISTING", importedPropertyId: property.id, reviewedAt: new Date(), reviewedByUserId: userId }
      });
      await tx.socialMediaItem.updateMany({
        where: { candidateId },
        data: { importStatus: "LINKED", propertyId: property.id }
      });

      return property;
    });
  }

  async ignoreCandidate(organizationId: string, candidateId: string, userId: string) {
    const candidate = await this.getCandidateOrThrow(organizationId, candidateId);
    if (candidate.status !== "PENDING_REVIEW") {
      throw new ConflictDomainError(`This candidate is already ${candidate.status.toLowerCase().replace("_", " ")}.`);
    }

    await this.prisma.client.$transaction([
      this.prisma.client.propertyImportCandidate.update({
        where: { id: candidateId },
        data: { status: "IGNORED", reviewedAt: new Date(), reviewedByUserId: userId }
      }),
      this.prisma.client.socialMediaItem.updateMany({ where: { candidateId }, data: { importStatus: "IGNORED" } })
    ]);
  }

  // Copies each grouped SocialMediaItem's media (its own primaryMediaUrl for
  // IMAGE/VIDEO/REEL, or its child assets for CAROUSEL) into PropertyMedia
  // rows referencing the source item. storageKey stays null - provider-hosted
  // URLs are used directly for MVP (they can expire; see PropertyMedia's
  // schema comment for the planned follow-up).
  private async attachCandidateMedia(
    tx: Prisma.TransactionClient,
    organizationId: string,
    propertyId: string,
    candidate: { items: Array<{ id: string; mediaType: string; primaryMediaUrl: string | null; thumbnailUrl: string | null; assets: Array<{ mediaUrl: string; thumbnailUrl: string | null; kind: string; position: number }> }> }
  ) {
    let position = 0;
    for (const item of candidate.items) {
      if (item.mediaType === "CAROUSEL" && item.assets.length > 0) {
        for (const asset of item.assets) {
          await tx.propertyMedia.create({
            data: {
              organizationId,
              propertyId,
              kind: asset.kind === "VIDEO" ? "VIDEO" : "IMAGE",
              externalUrl: asset.mediaUrl,
              source: "INSTAGRAM",
              sourceSocialMediaItemId: item.id,
              position: position++,
              isCover: position === 1
            }
          });
        }
      } else if (item.primaryMediaUrl) {
        await tx.propertyMedia.create({
          data: {
            organizationId,
            propertyId,
            kind: item.mediaType === "IMAGE" ? "IMAGE" : "VIDEO",
            externalUrl: item.primaryMediaUrl,
            source: "INSTAGRAM",
            sourceSocialMediaItemId: item.id,
            position: position++,
            isCover: position === 1
          }
        });
      }
    }
  }

  private async getCandidateOrThrow(organizationId: string, candidateId: string) {
    const candidate = await this.prisma.client.propertyImportCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate || candidate.organizationId !== organizationId) throw new NotFoundDomainError("Import candidate");
    return candidate;
  }

  private async getCandidateForReviewOrThrow(organizationId: string, candidateId: string) {
    const candidate = await this.prisma.client.propertyImportCandidate.findUnique({
      where: { id: candidateId },
      include: { items: true, possibleExistingProperty: { select: { title: true } } }
    });
    if (!candidate || candidate.organizationId !== organizationId) throw new NotFoundDomainError("Import candidate");
    return candidate;
  }

  private async getCandidateWithMediaOrThrow(organizationId: string, candidateId: string) {
    const candidate = await this.prisma.client.propertyImportCandidate.findUnique({
      where: { id: candidateId },
      include: { items: { include: { assets: true } } }
    });
    if (!candidate || candidate.organizationId !== organizationId) throw new NotFoundDomainError("Import candidate");
    return candidate;
  }

  private toCandidateDto(candidate: {
    id: string;
    connectedAccountId: string;
    status: PropertyImportCandidateStatus;
    confidence: number;
    transactionType: string;
    propertyType: string;
    title: string;
    description: string | null;
    priceCents: bigint | null;
    currency: string;
    country: string | null;
    city: string | null;
    district: string | null;
    address: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    areaSqm: number | null;
    availabilityHint: string | null;
    possibleExistingPropertyId: string | null;
    possibleExistingProperty?: { title: string } | null;
    importedPropertyId: string | null;
    createdAt: Date;
    items: Array<{ id: string; mediaType: string; thumbnailUrl: string | null; permalink: string | null; caption: string | null; postedAt: Date | null }>;
  }) {
    return {
      id: candidate.id,
      connectedAccountId: candidate.connectedAccountId,
      status: candidate.status,
      confidence: candidate.confidence,
      transactionType: candidate.transactionType,
      propertyType: candidate.propertyType,
      title: candidate.title,
      description: candidate.description,
      priceCents: candidate.priceCents,
      currency: candidate.currency,
      country: candidate.country,
      city: candidate.city,
      district: candidate.district,
      address: candidate.address,
      bedrooms: candidate.bedrooms,
      bathrooms: candidate.bathrooms,
      areaSqm: candidate.areaSqm,
      availabilityHint: candidate.availabilityHint,
      possibleExistingPropertyId: candidate.possibleExistingPropertyId,
      possibleExistingPropertyTitle: candidate.possibleExistingProperty?.title ?? null,
      importedPropertyId: candidate.importedPropertyId,
      items: candidate.items.map((item) => ({
        id: item.id,
        mediaType: item.mediaType,
        thumbnailUrl: item.thumbnailUrl,
        permalink: item.permalink,
        caption: item.caption,
        postedAt: item.postedAt
      })),
      createdAt: candidate.createdAt
    };
  }
}

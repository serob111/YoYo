import { Injectable } from "@nestjs/common";
import type { ProviderCapabilities } from "@yoyo/integrations";
import type {
  AddContentMediaAssetInput,
  CreateContentItemInput,
  EnhanceImageInput,
  GenerateCaptionInput,
  RejectContentItemInput,
  ScheduleContentItemInput,
  UpdateContentItemInput
} from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { OutboxService } from "../common/outbox.service";
import { AuditService } from "../audit/audit.service";
import { MediaService } from "../media/media.service";
import { RequestContext } from "../common/request-context";
import { ConflictDomainError, NotFoundDomainError } from "../common/domain-errors";

// Statuses in which the draft is still being assembled - caption/media edits
// and (re)generation are only allowed here, mirroring FollowUp/Automation's
// "you can only mutate a not-yet-committed row" convention.
const EDITABLE_STATUSES = ["DRAFT", "GENERATION_FAILED"] as const;

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly media: MediaService
  ) {}

  async list(organizationId: string, filters: { status?: string; connectedAccountId?: string }) {
    return this.prisma.client.contentItem.findMany({
      where: {
        organizationId,
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.connectedAccountId ? { connectedAccountId: filters.connectedAccountId } : {})
      },
      include: { media: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" }
    });
  }

  async getOrThrow(organizationId: string, id: string) {
    const item = await this.prisma.client.contentItem.findUnique({
      where: { id },
      include: { media: { orderBy: { order: "asc" } } }
    });
    if (!item || item.organizationId !== organizationId) throw new NotFoundDomainError("Content item");
    return item;
  }

  private assertEditable(status: string): void {
    if (!EDITABLE_STATUSES.includes(status as (typeof EDITABLE_STATUSES)[number])) {
      throw new ConflictDomainError(`Content item is '${status}' and can no longer be edited.`);
    }
  }

  async create(organizationId: string, userId: string, input: CreateContentItemInput) {
    const account = await this.prisma.client.connectedAccount.findUnique({ where: { id: input.connectedAccountId } });
    if (!account || account.organizationId !== organizationId) throw new NotFoundDomainError("Connected account");

    return this.prisma.client.contentItem.create({
      data: {
        organizationId,
        connectedAccountId: account.id,
        provider: account.provider,
        postType: input.postType,
        caption: input.caption ?? null,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        createdByUserId: userId
      }
    });
  }

  async update(organizationId: string, id: string, input: UpdateContentItemInput) {
    const item = await this.getOrThrow(organizationId, id);
    this.assertEditable(item.status);
    return this.prisma.client.contentItem.update({
      where: { id },
      data: {
        caption: input.caption !== undefined ? input.caption : undefined,
        scheduledFor: input.scheduledFor !== undefined ? (input.scheduledFor ? new Date(input.scheduledFor) : null) : undefined
      }
    });
  }

  async remove(organizationId: string, id: string) {
    const item = await this.getOrThrow(organizationId, id);
    if (item.status !== "DRAFT") throw new ConflictDomainError("Only a DRAFT content item can be deleted.");
    await this.prisma.client.contentItem.delete({ where: { id } });
  }

  async addMediaAsset(organizationId: string, contentItemId: string, input: AddContentMediaAssetInput) {
    const item = await this.getOrThrow(organizationId, contentItemId);
    this.assertEditable(item.status);
    this.media.assertOwnedByOrg(organizationId, input.storageKey);

    return this.prisma.client.contentMediaAsset.upsert({
      where: { contentItemId_order: { contentItemId, order: input.order } },
      create: {
        organizationId,
        contentItemId,
        order: input.order,
        kind: input.kind,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize ?? null
      },
      update: {
        kind: input.kind,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize ?? null,
        status: "UPLOADED",
        originalStorageKey: null,
        enhancementPrompt: null,
        enhancementError: null
      }
    });
  }

  async removeMediaAsset(organizationId: string, contentItemId: string, mediaAssetId: string) {
    const item = await this.getOrThrow(organizationId, contentItemId);
    this.assertEditable(item.status);
    const asset = item.media.find((m) => m.id === mediaAssetId);
    if (!asset) throw new NotFoundDomainError("Media asset");
    await this.prisma.client.contentMediaAsset.delete({ where: { id: mediaAssetId } });
  }

  async requestCaptionGeneration(organizationId: string, contentItemId: string, input: GenerateCaptionInput) {
    const item = await this.getOrThrow(organizationId, contentItemId);
    this.assertEditable(item.status);
    const requestId = RequestContext.current()?.requestId ?? "api";

    const claimed = await this.prisma.client.contentItem.updateMany({
      where: { id: contentItemId, status: { in: ["DRAFT", "GENERATION_FAILED"] } },
      data: { status: "GENERATING" }
    });
    if (claimed.count === 0) throw new ConflictDomainError("Caption generation is already in progress for this content item.");

    await this.prisma.client.$transaction(async (tx) => {
      await this.outbox.record(
        tx,
        {
          organizationId,
          aggregateType: "ContentItem",
          aggregateId: contentItemId,
          eventType: "content.caption_generation_requested",
          payload: { requestId, instruction: input.instruction }
        }
      );
    });

    return this.getOrThrow(organizationId, contentItemId);
  }

  async requestImageEnhancement(organizationId: string, contentItemId: string, mediaAssetId: string, input: EnhanceImageInput) {
    const item = await this.getOrThrow(organizationId, contentItemId);
    this.assertEditable(item.status);
    const asset = item.media.find((m) => m.id === mediaAssetId);
    if (!asset) throw new NotFoundDomainError("Media asset");
    if (asset.kind !== "IMAGE") throw new ConflictDomainError("Only image assets can be enhanced.");

    const requestId = RequestContext.current()?.requestId ?? "api";
    const claimed = await this.prisma.client.contentMediaAsset.updateMany({
      where: { id: mediaAssetId, status: { in: ["UPLOADED", "ENHANCEMENT_FAILED"] } },
      data: { status: "ENHANCING" }
    });
    if (claimed.count === 0) throw new ConflictDomainError("Image enhancement is already in progress for this asset.");

    await this.prisma.client.$transaction(async (tx) => {
      await this.outbox.record(
        tx,
        {
          organizationId,
          aggregateType: "ContentMediaAsset",
          aggregateId: mediaAssetId,
          eventType: "content.image_enhancement_requested",
          payload: { requestId, contentItemId, instruction: input.instruction }
        }
      );
    });

    return this.getOrThrow(organizationId, contentItemId);
  }

  private validateReadyToSubmit(item: Awaited<ReturnType<ContentService["getOrThrow"]>>): void {
    if (!item.caption) throw new ConflictDomainError("A caption is required before submitting for approval.");
    if (item.postType === "CAROUSEL") {
      if (item.media.length < 2 || item.media.length > 10) throw new ConflictDomainError("A carousel needs 2-10 media assets.");
      if (item.media.some((m) => m.kind !== "IMAGE")) throw new ConflictDomainError("Carousels support image assets only in this phase.");
    } else {
      if (item.media.length !== 1) throw new ConflictDomainError(`A ${item.postType} post needs exactly one media asset.`);
      if (item.media[0]!.kind !== item.postType) throw new ConflictDomainError(`Media kind does not match postType ${item.postType}.`);
    }
  }

  async submit(organizationId: string, id: string) {
    const item = await this.getOrThrow(organizationId, id);
    this.assertEditable(item.status);
    this.validateReadyToSubmit(item);

    const businessProfile = await this.prisma.client.businessProfile.findUnique({ where: { organizationId } });
    const autoPublish = businessProfile?.autoPublishEnabled ?? false;

    return this.prisma.client.$transaction(async (tx) => {
      if (autoPublish) {
        const updated = await tx.contentItem.update({
          where: { id },
          data: {
            status: "APPROVED",
            autoApproved: true,
            submittedForApprovalAt: new Date(),
            approvedAt: new Date(),
            scheduledFor: item.scheduledFor ?? new Date()
          }
        });
        await this.audit.record(
          {
            organizationId,
            action: "content.auto_approved",
            entityType: "ContentItem",
            entityId: id,
            metadata: { postType: item.postType }
          },
          tx
        );
        return updated;
      }

      return tx.contentItem.update({
        where: { id },
        data: { status: "PENDING_APPROVAL", submittedForApprovalAt: new Date() }
      });
    });
  }

  private async assertAccountCanPublish(connectedAccountId: string, postType: string): Promise<void> {
    const account = await this.prisma.client.connectedAccount.findUniqueOrThrow({ where: { id: connectedAccountId } });
    const capabilities = account.capabilities as unknown as ProviderCapabilities;
    const capabilityFlag =
      postType === "VIDEO" ? capabilities.videoPublishing : postType === "CAROUSEL" ? capabilities.carouselPublishing : capabilities.photoPublishing;
    if (!capabilityFlag) {
      throw new ConflictDomainError(`This connected account does not have ${postType.toLowerCase()} publishing permission - reconnect it first.`);
    }
  }

  async approve(organizationId: string, id: string, userId: string, scheduledFor?: string) {
    const item = await this.getOrThrow(organizationId, id);
    if (item.status !== "PENDING_APPROVAL") throw new ConflictDomainError(`Content item is '${item.status}' and cannot be approved.`);
    await this.assertAccountCanPublish(item.connectedAccountId, item.postType);

    return this.prisma.client.contentItem.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedByUserId: userId,
        approvedAt: new Date(),
        scheduledFor: scheduledFor ? new Date(scheduledFor) : (item.scheduledFor ?? new Date())
      }
    });
  }

  async reject(organizationId: string, id: string, userId: string, input: RejectContentItemInput) {
    const item = await this.getOrThrow(organizationId, id);
    if (item.status !== "PENDING_APPROVAL") throw new ConflictDomainError(`Content item is '${item.status}' and cannot be rejected.`);

    return this.prisma.client.contentItem.update({
      where: { id },
      data: { status: "REJECTED", rejectedByUserId: userId, rejectedAt: new Date(), rejectionReason: input.reason ?? null }
    });
  }

  async cancel(organizationId: string, id: string) {
    const item = await this.getOrThrow(organizationId, id);
    if (!["DRAFT", "GENERATION_FAILED", "PENDING_APPROVAL", "APPROVED"].includes(item.status)) {
      throw new ConflictDomainError(`Content item is '${item.status}' and cannot be cancelled.`);
    }
    return this.prisma.client.contentItem.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  }

  async reschedule(organizationId: string, id: string, input: ScheduleContentItemInput) {
    const item = await this.getOrThrow(organizationId, id);
    if (item.status !== "APPROVED") throw new ConflictDomainError("Only an APPROVED content item can be rescheduled.");
    return this.prisma.client.contentItem.update({
      where: { id },
      data: { scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : new Date() }
    });
  }
}

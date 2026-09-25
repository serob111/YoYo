import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Redis } from "ioredis";
import {
  createAiResponsesQueue,
  createAutomationsQueue,
  createContentGenerationQueue,
  createKnowledgeEmbeddingsQueue,
  createOutboundMessagesQueue,
  createSocialSyncQueue,
  createWebhookEventsQueue,
  enqueueAiResponse,
  enqueueAutomationTrigger,
  enqueueCaptionGeneration,
  enqueueImageEnhancement,
  enqueueKnowledgeEmbedding,
  enqueueOutboundMessage,
  enqueueSocialSync,
  enqueueWebhookEvent
} from "@yoyo/queue";
import { PrismaService } from "./prisma.service";
import { REDIS_CONNECTION } from "./env.tokens";
import type { OutboxEventType } from "./outbox.service";

interface OutboxRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: OutboxEventType;
  organizationId: string | null;
  payload: Record<string, unknown>;
}

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 500;

/**
 * Polls PENDING outbox rows and enqueues each to its BullMQ queue. Uses
 * `FOR UPDATE SKIP LOCKED` so multiple horizontally-scaled API replicas can run
 * this concurrently without double-dispatching the same row - each replica
 * claims a disjoint set of rows per tick. See docs/adr/0004.
 */
@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly webhookEventsQueue;
  private readonly outboundMessagesQueue;
  private readonly aiResponsesQueue;
  private readonly knowledgeEmbeddingsQueue;
  private readonly automationsQueue;
  private readonly contentGenerationQueue;
  private readonly socialSyncQueue;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CONNECTION) redis: Redis
  ) {
    this.webhookEventsQueue = createWebhookEventsQueue(redis);
    this.outboundMessagesQueue = createOutboundMessagesQueue(redis);
    this.aiResponsesQueue = createAiResponsesQueue(redis);
    this.knowledgeEmbeddingsQueue = createKnowledgeEmbeddingsQueue(redis);
    this.automationsQueue = createAutomationsQueue(redis);
    this.contentGenerationQueue = createContentGenerationQueue(redis);
    this.socialSyncQueue = createSocialSyncQueue(redis);
  }

  onModuleInit(): void {
    // tick() rejecting (e.g. a batch exceeding Prisma's interactive-transaction
    // timeout under load) must never become an unhandled rejection here - that
    // would crash the whole API process, not just this poller. Log and let the
    // next interval retry instead.
    this.timer = setInterval(() => {
      this.tick().catch((error: unknown) => {
        this.logger.error("Outbox dispatch tick failed", error instanceof Error ? error.stack : error);
      });
    }, POLL_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopPolling();
    await this.webhookEventsQueue.close();
    await this.outboundMessagesQueue.close();
    await this.aiResponsesQueue.close();
    await this.knowledgeEmbeddingsQueue.close();
    await this.automationsQueue.close();
    await this.contentGenerationQueue.close();
    await this.socialSyncQueue.close();
  }

  /** Test-only: stop the automatic interval so tests can drive `tick()` deterministically. */
  stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Exposed for tests, which call this directly rather than waiting on the timer. */
  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      return await this.dispatchOneBatch();
    } finally {
      this.ticking = false;
    }
  }

  private async dispatchOneBatch(): Promise<number> {
    return this.prisma.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT id, "aggregateType" as "aggregateType", "aggregateId" as "aggregateId", "eventType" as "eventType", "organizationId" as "organizationId", payload
        FROM outbox_events
        WHERE status = 'PENDING'
        ORDER BY "createdAt"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      for (const row of rows) {
        try {
          await this.dispatchOne(row);
          await tx.outboxEvent.update({ where: { id: row.id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
        } catch (error) {
          this.logger.error(`Failed to dispatch outbox event ${row.id}`, error instanceof Error ? error.stack : error);
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { attemptCount: { increment: 1 }, lastError: error instanceof Error ? error.message : String(error) }
          });
        }
      }

      return rows.length;
    });
  }

  private async dispatchOne(row: OutboxRow): Promise<void> {
    const requestId = (row.payload.requestId as string | undefined) ?? "outbox";
    switch (row.eventType) {
      case "webhook.received":
        await enqueueWebhookEvent(this.webhookEventsQueue, { providerWebhookEventId: row.aggregateId, requestId });
        return;
      case "message.outbound_pending":
        await enqueueOutboundMessage(this.outboundMessagesQueue, { messageId: row.aggregateId, requestId });
        return;
      case "message.inbound_received":
        await enqueueAiResponse(this.aiResponsesQueue, { triggerMessageId: row.aggregateId, requestId });
        return;
      case "knowledge_chunk.embedding_pending":
        await enqueueKnowledgeEmbedding(this.knowledgeEmbeddingsQueue, { knowledgeChunkId: row.aggregateId, requestId });
        return;
      case "lead.created":
      case "lead.stage_changed":
        if (!row.organizationId) throw new Error(`Outbox row ${row.id} of type ${row.eventType} is missing organizationId`);
        await enqueueAutomationTrigger(this.automationsQueue, {
          outboxEventId: row.id,
          eventType: row.eventType,
          organizationId: row.organizationId,
          leadId: row.aggregateId,
          payload: row.payload,
          requestId
        });
        return;
      case "property.activated":
        if (!row.organizationId) throw new Error(`Outbox row ${row.id} of type ${row.eventType} is missing organizationId`);
        await this.dispatchListingMatched(row.id, row.organizationId, row.aggregateId, requestId);
        return;
      case "content.caption_generation_requested":
        await enqueueCaptionGeneration(this.contentGenerationQueue, {
          contentItemId: row.aggregateId,
          instruction: row.payload.instruction as string | undefined,
          requestId
        });
        return;
      case "content.image_enhancement_requested":
        await enqueueImageEnhancement(this.contentGenerationQueue, {
          contentItemId: row.payload.contentItemId as string,
          mediaAssetId: row.aggregateId,
          instruction: row.payload.instruction as string,
          requestId
        });
        return;
      case "social_sync.requested":
        await enqueueSocialSync(this.socialSyncQueue, {
          socialSyncId: row.aggregateId,
          connectedAccountId: row.payload.connectedAccountId as string,
          requestId
        });
        return;
      default: {
        const exhaustiveCheck: never = row.eventType;
        throw new Error(`Unknown outbox event type: ${exhaustiveCheck}`);
      }
    }
  }

  /**
   * Inverts searchProperties' filter logic (apps/worker-ai/src/verticals/
   * real-estate.ts) to find saved BuyerPreference rows this newly-ACTIVE
   * property satisfies, then resolves each matched contact's most-recent
   * lead (same fallback SCHEDULE_FOLLOW_UP already uses) - skipping contacts
   * with no lead yet, since there's nothing to attach a LISTING_MATCHED
   * automation run to. Cheap no-op when the org has no enabled
   * LISTING_MATCHED automation, so this never runs the matching query for
   * orgs that haven't set one up.
   */
  private async dispatchListingMatched(outboxEventId: string, organizationId: string, propertyId: string, requestId: string): Promise<void> {
    const hasListingMatchedAutomation = await this.prisma.client.automation.findFirst({
      where: { organizationId, triggerType: "LISTING_MATCHED", enabled: true },
      select: { id: true }
    });
    if (!hasListingMatchedAutomation) return;

    const property = await this.prisma.client.property.findUnique({ where: { id: propertyId } });
    if (!property || property.organizationId !== organizationId) return;

    const matches = await this.prisma.client.buyerPreference.findMany({
      where: {
        organizationId,
        transactionType: property.transactionType,
        AND: [
          property.priceCents != null ? { OR: [{ minPriceCents: null }, { minPriceCents: { lte: property.priceCents } }] } : {},
          property.priceCents != null ? { OR: [{ maxPriceCents: null }, { maxPriceCents: { gte: property.priceCents } }] } : {},
          property.areaSqm != null ? { OR: [{ minAreaSqm: null }, { minAreaSqm: { lte: property.areaSqm } }] } : {},
          property.bedrooms != null ? { OR: [{ bedrooms: null }, { bedrooms: { lte: property.bedrooms } }] } : {},
          property.country ? { OR: [{ country: null }, { country: property.country }] } : {},
          property.city ? { OR: [{ city: null }, { city: property.city }] } : {},
          property.district ? { OR: [{ districts: { isEmpty: true } }, { districts: { has: property.district } }] } : {},
          { OR: [{ propertyType: null }, { propertyType: property.propertyType }] }
        ]
      },
      select: { contactId: true }
    });
    if (matches.length === 0) return;

    // A contact can only have one BuyerPreference per transactionType (unique
    // constraint), so contactIds here are already distinct.
    for (const match of matches) {
      const lead = await this.prisma.client.lead.findFirst({
        where: { organizationId, contactId: match.contactId },
        orderBy: { createdAt: "desc" }
      });
      if (!lead) continue;

      await enqueueAutomationTrigger(this.automationsQueue, {
        outboxEventId,
        eventType: "property.activated",
        organizationId,
        leadId: lead.id,
        payload: { requestId, propertyId },
        requestId,
        triggerEventId: `${outboxEventId}__${lead.id}`
      });
    }
  }
}

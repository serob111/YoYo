import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Redis } from "ioredis";
import {
  createOutboundMessagesQueue,
  createWebhookEventsQueue,
  enqueueOutboundMessage,
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

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CONNECTION) redis: Redis
  ) {
    this.webhookEventsQueue = createWebhookEventsQueue(redis);
    this.outboundMessagesQueue = createOutboundMessagesQueue(redis);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopPolling();
    await this.webhookEventsQueue.close();
    await this.outboundMessagesQueue.close();
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
        SELECT id, "aggregateType" as "aggregateType", "aggregateId" as "aggregateId", "eventType" as "eventType", payload
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
      default: {
        const exhaustiveCheck: never = row.eventType;
        throw new Error(`Unknown outbox event type: ${exhaustiveCheck}`);
      }
    }
  }
}

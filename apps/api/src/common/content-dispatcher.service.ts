import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Redis } from "ioredis";
import { createPublishingQueue, enqueuePublish } from "@yoyo/queue";
import { PrismaService } from "./prisma.service";
import { REDIS_CONNECTION } from "./env.tokens";

interface ContentItemRow {
  id: string;
}

const BATCH_SIZE = 20;
// Content scheduling is minute-granularity, not sub-second like the outbox -
// same 30s cadence as FollowUpDispatcherService, which this mirrors exactly.
const POLL_INTERVAL_MS = 30_000;

/**
 * Polls due (scheduledFor <= now, still APPROVED) ContentItem rows and hands
 * each off to the `publishing` BullMQ queue. Structurally identical to
 * FollowUpDispatcherService (same FOR UPDATE SKIP LOCKED claim so multiple
 * horizontally-scaled API replicas never double-dispatch), except it polls
 * ContentItem instead of FollowUp. This dispatcher does NOT mark
 * APPROVED -> PUBLISHING itself - only apps/worker-publishing does that
 * atomic claim, which is the actual duplicate-publish-prevention exit
 * criterion (this dispatcher's deterministic jobId is only the first line of
 * defense against a double-enqueue).
 */
@Injectable()
export class ContentDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentDispatcherService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly publishingQueue;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CONNECTION) redis: Redis
  ) {
    this.publishingQueue = createPublishingQueue(redis);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopPolling();
    await this.publishingQueue.close();
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
      const rows = await tx.$queryRaw<ContentItemRow[]>`
        SELECT id
        FROM content_items
        WHERE status = 'APPROVED' AND "scheduledFor" <= now()
        ORDER BY "createdAt"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      for (const row of rows) {
        try {
          await enqueuePublish(this.publishingQueue, { contentItemId: row.id, requestId: "content-dispatcher" });
        } catch (error) {
          this.logger.error(`Failed to dispatch content item ${row.id}`, error instanceof Error ? error.stack : error);
        }
      }

      return rows.length;
    });
  }
}

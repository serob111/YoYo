import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Redis } from "ioredis";
import { createFollowUpsQueue, enqueueFollowUp } from "@yoyo/queue";
import { PrismaService } from "./prisma.service";
import { REDIS_CONNECTION } from "./env.tokens";

interface FollowUpRow {
  id: string;
}

const BATCH_SIZE = 20;
// Follow-ups are minute-granularity, not sub-second like the outbox (500ms) -
// 30s is plenty responsive for "send this reminder at time X."
const POLL_INTERVAL_MS = 30_000;

/**
 * Polls due (scheduledFor <= now, still PENDING) FollowUp rows and hands each
 * off to the `follow-ups` BullMQ queue. Structurally identical to
 * OutboxDispatcherService (same FOR UPDATE SKIP LOCKED claim so multiple
 * horizontally-scaled API replicas never double-dispatch), except it polls a
 * time condition instead of a status-only one, and it only hands off to the
 * queue here - the worker itself (not this dispatcher) marks FollowUp
 * SENT/FAILED once the action has actually executed.
 */
@Injectable()
export class FollowUpDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FollowUpDispatcherService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly followUpsQueue;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CONNECTION) redis: Redis
  ) {
    this.followUpsQueue = createFollowUpsQueue(redis);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopPolling();
    await this.followUpsQueue.close();
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
      const rows = await tx.$queryRaw<FollowUpRow[]>`
        SELECT id
        FROM follow_ups
        WHERE status = 'PENDING' AND "scheduledFor" <= now()
        ORDER BY "scheduledFor"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      for (const row of rows) {
        try {
          await enqueueFollowUp(this.followUpsQueue, { followUpId: row.id, requestId: "follow-up-dispatcher" });
        } catch (error) {
          this.logger.error(`Failed to dispatch follow-up ${row.id}`, error instanceof Error ? error.stack : error);
        }
      }

      return rows.length;
    });
  }
}

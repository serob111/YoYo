import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { createEmailQueue, enqueueEmail, type EmailJobData } from "@yoyo/queue";
import type { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../common/env.tokens";
import { RequestContext } from "../common/request-context";

@Injectable()
export class EmailQueueService implements OnModuleDestroy {
  private readonly queue: Queue<EmailJobData>;

  constructor(@Inject(REDIS_CONNECTION) redis: Redis) {
    this.queue = createEmailQueue(redis);
  }

  async send(input: Omit<EmailJobData, "requestId">): Promise<void> {
    const requestId = RequestContext.current()?.requestId ?? "unknown";
    await enqueueEmail(this.queue, { ...input, requestId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

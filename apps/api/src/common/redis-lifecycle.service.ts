import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "./env.tokens";

/**
 * The shared ioredis connection is passed by reference into BullMQ Queues/Workers,
 * which do NOT close a connection they don't own. Something has to quit it on
 * shutdown, or the process (and Jest, in tests) never exits cleanly.
 */
@Injectable()
export class RedisLifecycleService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

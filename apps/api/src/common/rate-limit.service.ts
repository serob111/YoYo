import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "./env.tokens";

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  /**
   * Fixed-window counter shared across every API instance via Redis, so rate limits
   * are meaningful once the API is horizontally scaled (an in-memory counter would not be).
   */
  async consume(key: string, windowSeconds: number, maxAttempts: number): Promise<{ allowed: boolean; remaining: number }> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, windowSeconds);
    }
    return { allowed: count <= maxAttempts, remaining: Math.max(0, maxAttempts - count) };
  }
}

import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import type { Redis } from "ioredis";
import { PrismaService } from "../common/prisma.service";
import { REDIS_CONNECTION } from "../common/env.tokens";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis
  ) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(@Res() res: Response) {
    const [dbOk, redisOk] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const ready = dbOk && redisOk;
    res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: ready ? "ok" : "degraded",
      checks: { database: dbOk ? "ok" : "fail", redis: redisOk ? "ok" : "fail" }
    });
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === "PONG";
    } catch {
      return false;
    }
  }
}

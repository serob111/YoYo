import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { Redis } from "ioredis";
import { resetDatabase } from "@yoyo/testing";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/common/prisma.service";
import { REDIS_CONNECTION } from "../../src/common/env.tokens";

export async function buildTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  return app;
}

export async function resetTestDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await resetDatabase(prisma.client);
}

/**
 * All integration tests run in-band against the same Redis instance from the same
 * IP, so the auth rate limiter's counters must be cleared between tests — otherwise
 * unrelated tests exhaust each other's rate-limit budget. See RATE_LIMIT_AUTH_* env.
 */
export async function resetTestRedis(app: INestApplication): Promise<void> {
  const redis = app.get<Redis>(REDIS_CONNECTION);
  await redis.flushdb();
}

export function getPrisma(app: INestApplication) {
  return app.get(PrismaService).client;
}

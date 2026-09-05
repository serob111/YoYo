import type { INestApplication } from "@nestjs/common";
import type { Redis } from "ioredis";
import { createWebhookEventsQueue, createRedisConnection } from "@yoyo/queue";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { OutboxDispatcherService } from "../src/common/outbox-dispatcher.service";
import { PrismaService } from "../src/common/prisma.service";
import { REDIS_CONNECTION } from "../src/common/env.tokens";

describe("OutboxDispatcherService", () => {
  let app: INestApplication;
  let dispatcher: OutboxDispatcherService;
  let dispatcherB: OutboxDispatcherService;

  beforeAll(async () => {
    app = await buildTestApp();
    dispatcher = app.get(OutboxDispatcherService);
    // Stop the app's own polling interval so tests can drive dispatch
    // deterministically instead of racing a background timer.
    dispatcher.stopPolling();

    // A second, independent dispatcher instance (its own in-process `ticking`
    // guard) simulates a second horizontally-scaled API replica, so the
    // concurrency test below actually exercises `FOR UPDATE SKIP LOCKED`
    // rather than just this process's own reentrancy guard.
    const prismaService = app.get(PrismaService);
    const redis = app.get<Redis>(REDIS_CONNECTION);
    dispatcherB = new OutboxDispatcherService(prismaService, redis);
  });

  afterAll(async () => {
    dispatcherB.stopPolling();
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);
  });

  it("dispatches PENDING rows and marks them DISPATCHED", async () => {
    const prisma = getPrisma(app);
    const row = await prisma.outboxEvent.create({
      data: {
        aggregateType: "ProviderWebhookEvent",
        aggregateId: "00000000-0000-0000-0000-000000000001",
        eventType: "webhook.received",
        payload: { requestId: "test" }
      }
    });

    const dispatchedCount = await dispatcher.tick();
    expect(dispatchedCount).toBe(1);

    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.status).toBe("DISPATCHED");
    expect(updated.dispatchedAt).not.toBeNull();

    const queueConnection = createRedisConnection(process.env.REDIS_URL!);
    const queue = createWebhookEventsQueue(queueConnection);
    const job = await queue.getJob(`webhook__${row.aggregateId}`);
    expect(job).toBeTruthy();
    expect(job?.data.providerWebhookEventId).toBe(row.aggregateId);
    await queue.close();
    await queueConnection.quit();
  });

  it("never double-dispatches the same row when two dispatcher instances tick concurrently", async () => {
    const prisma = getPrisma(app);
    const rows = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        prisma.outboxEvent.create({
          data: {
            aggregateType: "ProviderWebhookEvent",
            aggregateId: `00000000-0000-0000-0000-00000000010${i}`,
            eventType: "webhook.received",
            payload: { requestId: "test" }
          }
        })
      )
    );

    const [countA, countB] = await Promise.all([dispatcher.tick(), dispatcherB.tick()]);
    expect(countA + countB).toBe(rows.length);

    const remaining = await prisma.outboxEvent.count({ where: { status: "PENDING" } });
    expect(remaining).toBe(0);
    const dispatched = await prisma.outboxEvent.count({ where: { status: "DISPATCHED" } });
    expect(dispatched).toBe(rows.length);
  });
});

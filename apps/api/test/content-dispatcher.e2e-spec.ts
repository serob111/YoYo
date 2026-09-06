import type { INestApplication } from "@nestjs/common";
import type { Redis } from "ioredis";
import { createPublishingQueue, createRedisConnection } from "@yoyo/queue";
import { createTestConnectedAccount, createTestContentItem, createOrgWithOwner } from "@yoyo/testing";
import { TokenEncryptionService } from "@yoyo/crypto";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { ContentDispatcherService } from "../src/common/content-dispatcher.service";
import { PrismaService } from "../src/common/prisma.service";
import { REDIS_CONNECTION } from "../src/common/env.tokens";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

describe("ContentDispatcherService", () => {
  let app: INestApplication;
  let dispatcher: ContentDispatcherService;
  let dispatcherB: ContentDispatcherService;

  beforeAll(async () => {
    app = await buildTestApp();
    dispatcher = app.get(ContentDispatcherService);
    dispatcher.stopPolling();

    const prismaService = app.get(PrismaService);
    const redis = app.get<Redis>(REDIS_CONNECTION);
    dispatcherB = new ContentDispatcherService(prismaService, redis);
  });

  afterAll(async () => {
    dispatcherB.stopPolling();
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);
  });

  async function seedAccount(organizationId: string) {
    const prisma = getPrisma(app);
    return createTestConnectedAccount(prisma, { organizationId, encryptedAccessToken: tokenEncryption.encrypt("fake-token") });
  }

  it("dispatches a due APPROVED content item to the publishing queue", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const account = await seedAccount(organization.id);
    const item = await createTestContentItem(prisma, {
      organizationId: organization.id,
      connectedAccountId: account.id,
      status: "APPROVED",
      scheduledFor: new Date(Date.now() - 60_000)
    });

    const dispatchedCount = await dispatcher.tick();
    expect(dispatchedCount).toBe(1);

    const queueConnection = createRedisConnection(process.env.REDIS_URL!);
    const queue = createPublishingQueue(queueConnection);
    const job = await queue.getJob(`publish__${item.id}`);
    expect(job).toBeTruthy();
    expect(job?.data.contentItemId).toBe(item.id);
    await queue.close();
    await queueConnection.quit();
  });

  it("does not dispatch a content item scheduled in the future", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const account = await seedAccount(organization.id);
    await createTestContentItem(prisma, {
      organizationId: organization.id,
      connectedAccountId: account.id,
      status: "APPROVED",
      scheduledFor: new Date(Date.now() + 60 * 60_000)
    });

    expect(await dispatcher.tick()).toBe(0);
  });

  it("does not dispatch a DRAFT or PENDING_APPROVAL content item even if scheduledFor is in the past", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const account = await seedAccount(organization.id);
    await createTestContentItem(prisma, { organizationId: organization.id, connectedAccountId: account.id, status: "DRAFT", scheduledFor: new Date(Date.now() - 60_000) });
    await createTestContentItem(prisma, {
      organizationId: organization.id,
      connectedAccountId: account.id,
      status: "PENDING_APPROVAL",
      scheduledFor: new Date(Date.now() - 60_000)
    });

    expect(await dispatcher.tick()).toBe(0);
  });

  it("never double-claims the same due row when two dispatcher instances tick concurrently", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const account = await seedAccount(organization.id);
    const items = await Promise.all(
      Array.from({ length: 10 }, () =>
        createTestContentItem(prisma, { organizationId: organization.id, connectedAccountId: account.id, status: "APPROVED", scheduledFor: new Date(Date.now() - 60_000) })
      )
    );

    const [countA, countB] = await Promise.all([dispatcher.tick(), dispatcherB.tick()]);
    expect(countA + countB).toBe(items.length);

    const queueConnection = createRedisConnection(process.env.REDIS_URL!);
    const queue = createPublishingQueue(queueConnection);
    const jobCounts = await queue.getJobCounts();
    expect((jobCounts.waiting ?? 0) + (jobCounts.delayed ?? 0) + (jobCounts.active ?? 0)).toBe(items.length);
    await queue.close();
    await queueConnection.quit();
  });
});

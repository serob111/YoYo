import type { INestApplication } from "@nestjs/common";
import type { Redis } from "ioredis";
import { createFollowUpsQueue, createRedisConnection } from "@yoyo/queue";
import { createOrgWithOwner, createTestContact, createTestFollowUp } from "@yoyo/testing";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { FollowUpDispatcherService } from "../src/common/follow-up-dispatcher.service";
import { PrismaService } from "../src/common/prisma.service";
import { REDIS_CONNECTION } from "../src/common/env.tokens";

describe("FollowUpDispatcherService", () => {
  let app: INestApplication;
  let dispatcher: FollowUpDispatcherService;
  let dispatcherB: FollowUpDispatcherService;

  beforeAll(async () => {
    app = await buildTestApp();
    dispatcher = app.get(FollowUpDispatcherService);
    dispatcher.stopPolling();

    const prismaService = app.get(PrismaService);
    const redis = app.get<Redis>(REDIS_CONNECTION);
    dispatcherB = new FollowUpDispatcherService(prismaService, redis);
  });

  afterAll(async () => {
    dispatcherB.stopPolling();
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);
  });

  async function seedLead(organizationId: string) {
    const prisma = getPrisma(app);
    const contact = await createTestContact(prisma, { organizationId });
    const pipeline = await getOrCreateDefaultPipeline(prisma, organizationId);
    return prisma.lead.create({
      data: { organizationId, contactId: contact.id, pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, title: "Test lead" }
    });
  }

  it("dispatches a due PENDING follow-up to the queue", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const lead = await seedLead(organization.id);
    const followUp = await createTestFollowUp(prisma, {
      organizationId: organization.id,
      leadId: lead.id,
      scheduledFor: new Date(Date.now() - 60_000)
    });

    const dispatchedCount = await dispatcher.tick();
    expect(dispatchedCount).toBe(1);

    const queueConnection = createRedisConnection(process.env.REDIS_URL!);
    const queue = createFollowUpsQueue(queueConnection);
    const job = await queue.getJob(`follow-up__${followUp.id}`);
    expect(job).toBeTruthy();
    expect(job?.data.followUpId).toBe(followUp.id);
    await queue.close();
    await queueConnection.quit();
  });

  it("does not dispatch a follow-up scheduled in the future", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const lead = await seedLead(organization.id);
    await createTestFollowUp(prisma, { organizationId: organization.id, leadId: lead.id, scheduledFor: new Date(Date.now() + 60 * 60_000) });

    const dispatchedCount = await dispatcher.tick();
    expect(dispatchedCount).toBe(0);
  });

  it("never double-claims the same due row when two dispatcher instances tick concurrently", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const lead = await seedLead(organization.id);
    const followUps = await Promise.all(
      Array.from({ length: 10 }, () => createTestFollowUp(prisma, { organizationId: organization.id, leadId: lead.id, scheduledFor: new Date(Date.now() - 60_000) }))
    );

    const [countA, countB] = await Promise.all([dispatcher.tick(), dispatcherB.tick()]);
    expect(countA + countB).toBe(followUps.length);

    const queueConnection = createRedisConnection(process.env.REDIS_URL!);
    const queue = createFollowUpsQueue(queueConnection);
    const jobCounts = await queue.getJobCounts();
    expect((jobCounts.waiting ?? 0) + (jobCounts.delayed ?? 0) + (jobCounts.active ?? 0)).toBe(followUps.length);
    await queue.close();
    await queueConnection.quit();
  });
});

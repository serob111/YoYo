import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createAutomationsQueue, createRedisConnection } from "@yoyo/queue";
import { createTestAutomation, createTestContact } from "@yoyo/testing";
import { processAutomationTrigger } from "@yoyo/worker-automations";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";
import { OutboxDispatcherService } from "../src/common/outbox-dispatcher.service";

describe("Listing-matched automation flow (property.activated -> LISTING_MATCHED)", () => {
  let app: INestApplication;
  let dispatcher: OutboxDispatcherService;

  beforeAll(async () => {
    app = await buildTestApp();
    dispatcher = app.get(OutboxDispatcherService);
    dispatcher.stopPolling();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);
  });

  async function seedRealEstateOrgWithLead() {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Listing Match Realty" })
      .expect(201);
    const organizationId: string = orgRes.body.id;
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/vertical`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ vertical: "real_estate" })
      .expect(200);

    const prisma = getPrisma(app);
    const contact = await createTestContact(prisma, { organizationId, displayName: "Buyer Contact" });

    const leadRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/leads`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ contactId: contact.id, title: "Wants a 2BR in Yerevan" })
      .expect(201);

    return { owner, organizationId, contact, leadId: leadRes.body.id as string };
  }

  it("enqueues one automation-trigger job per matched lead when a property goes ACTIVE, and running it creates the configured task", async () => {
    const { owner, organizationId, contact, leadId } = await seedRealEstateOrgWithLead();
    const prisma = getPrisma(app);

    await prisma.buyerPreference.create({
      data: {
        organizationId,
        contactId: contact.id,
        transactionType: "SALE",
        maxPriceCents: 20_000_000,
        bedrooms: 2,
        country: "Armenia",
        city: "Yerevan"
      }
    });

    await createTestAutomation(prisma, {
      organizationId,
      triggerType: "LISTING_MATCHED",
      actionType: "CREATE_TASK",
      actionConfig: { title: "Tell the buyer about the new listing" }
    });

    const propertyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({
        title: "Kentron 2BR",
        propertyType: "APARTMENT",
        transactionType: "SALE",
        status: "ACTIVE",
        priceCents: 18_000_000,
        bedrooms: 2,
        country: "Armenia",
        city: "Yerevan"
      })
      .expect(201);

    const outboxRow = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: propertyRes.body.id, eventType: "property.activated" } });

    // 2, not 1 - seeding the lead above also left its own pending lead.created
    // row, and tick() dispatches every PENDING row in one batch, not just ours.
    const dispatchedCount = await dispatcher.tick();
    expect(dispatchedCount).toBe(2);

    const queueConnection = createRedisConnection(process.env.REDIS_URL!);
    const queue = createAutomationsQueue(queueConnection);
    const job = await queue.getJob(`automation-trigger__${outboxRow.id}__${leadId}`);
    expect(job).toBeTruthy();
    expect(job?.data.leadId).toBe(leadId);
    expect(job?.data.eventType).toBe("property.activated");
    await queue.close();
    await queueConnection.quit();

    const result = await processAutomationTrigger(prisma, {
      outboxEventId: job!.data.outboxEventId,
      eventType: "property.activated",
      organizationId,
      leadId: job!.data.leadId,
      payload: job!.data.payload,
      triggerEventId: job!.data.triggerEventId
    });
    expect(result).toBe("processed");

    const task = await prisma.task.findFirstOrThrow({ where: { leadId } });
    expect(task.title).toBe("Tell the buyer about the new listing");
  });

  it("does not enqueue anything when the org has no enabled LISTING_MATCHED automation", async () => {
    const { owner, organizationId, contact } = await seedRealEstateOrgWithLead();
    const prisma = getPrisma(app);

    await prisma.buyerPreference.create({
      data: { organizationId, contactId: contact.id, transactionType: "SALE", maxPriceCents: 20_000_000 }
    });

    const propertyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "No automations configured", propertyType: "APARTMENT", transactionType: "SALE", status: "ACTIVE", priceCents: 15_000_000 })
      .expect(201);

    await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: propertyRes.body.id, eventType: "property.activated" } });
    await dispatcher.tick();

    // No AutomationExecution should exist since dispatchListingMatched short-circuits before the matching query.
    expect(await prisma.automationExecution.count({ where: { organizationId } })).toBe(0);
  });

  it("does not re-emit property.activated when an already-ACTIVE property is merely edited", async () => {
    const { owner, organizationId } = await seedRealEstateOrgWithLead();
    const prisma = getPrisma(app);

    const propertyRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/properties`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Already active", propertyType: "APARTMENT", transactionType: "SALE", status: "ACTIVE", priceCents: 10_000_000 })
      .expect(201);

    expect(await prisma.outboxEvent.count({ where: { aggregateId: propertyRes.body.id, eventType: "property.activated" } })).toBe(1);

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/properties/${propertyRes.body.id}`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ title: "Already active", propertyType: "APARTMENT", transactionType: "SALE", status: "ACTIVE", priceCents: 10_500_000 })
      .expect(200);

    expect(await prisma.outboxEvent.count({ where: { aggregateId: propertyRes.body.id, eventType: "property.activated" } })).toBe(1);
  });
});

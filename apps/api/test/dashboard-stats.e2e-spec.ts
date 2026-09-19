import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { createTestConnectedAccount, createTestContact, createTestFollowUp, createTestLead } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";

describe("Dashboard stats", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);
  });

  it("aggregates new leads, overdue follow-ups, conversion rate, and AI-vs-human conversation counts", async () => {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Stats Bakery" })
      .expect(201);
    const organizationId: string = orgRes.body.id;

    const prisma = getPrisma(app);
    const contact = await createTestContact(prisma, { organizationId });
    const pipeline = await getOrCreateDefaultPipeline(prisma, organizationId);
    const newStage = pipeline.stages.find((s) => s.name === "New")!;
    const wonStage = pipeline.stages.find((s) => s.isWon)!;
    const lostStage = pipeline.stages.find((s) => s.isLost)!;

    // One won, one lost, one still open - conversion rate should be 1/2.
    const wonLead = await createTestLead(prisma, { organizationId, contactId: contact.id, pipelineId: pipeline.id, stageId: newStage.id });
    await prisma.lead.update({ where: { id: wonLead.id }, data: { stageId: wonStage.id, closedAt: new Date() } });
    const lostLead = await createTestLead(prisma, { organizationId, contactId: contact.id, pipelineId: pipeline.id, stageId: newStage.id });
    await prisma.lead.update({ where: { id: lostLead.id }, data: { stageId: lostStage.id, closedAt: new Date() } });
    const openLead = await createTestLead(prisma, { organizationId, contactId: contact.id, pipelineId: pipeline.id, stageId: newStage.id });

    // Overdue (past scheduledFor, still PENDING) and a future one that must not count.
    await createTestFollowUp(prisma, { organizationId, leadId: openLead.id, scheduledFor: new Date(Date.now() - 60 * 60 * 1000) });
    await createTestFollowUp(prisma, { organizationId, leadId: openLead.id, scheduledFor: new Date(Date.now() + 60 * 60 * 1000) });

    const connectedAccount = await createTestConnectedAccount(prisma, { organizationId, encryptedAccessToken: "enc-token" });
    await prisma.conversation.create({
      data: { organizationId, connectedAccountId: connectedAccount.id, contactId: contact.id, provider: "INSTAGRAM", automationState: "AI_ACTIVE" }
    });
    const secondContact = await createTestContact(prisma, { organizationId, displayName: "Second Customer" });
    await prisma.conversation.create({
      data: { organizationId, connectedAccountId: connectedAccount.id, contactId: secondContact.id, provider: "INSTAGRAM", automationState: "HUMAN_ACTIVE" }
    });

    const res = await request(app.getHttpServer()).get(`/organizations/${organizationId}/dashboard-stats`).set("Cookie", owner.cookieHeader).expect(200);

    expect(res.body).toMatchObject({
      newLeadsThisWeek: 3,
      overdueFollowUps: 1,
      conversionRate: 0.5,
      aiHandledConversations: 1,
      humanHandledConversations: 1
    });
  });

  it("returns a null conversion rate when no leads have closed yet", async () => {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Fresh Org" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/organizations/${orgRes.body.id}/dashboard-stats`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);

    expect(res.body).toMatchObject({
      newLeadsThisWeek: 0,
      overdueFollowUps: 0,
      conversionRate: null,
      aiHandledConversations: 0,
      humanHandledConversations: 0
    });
  });
});

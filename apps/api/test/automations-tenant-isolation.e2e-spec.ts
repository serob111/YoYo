import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { createTestAutomation, createTestContact, createTestFollowUp } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser, type AuthedContext } from "./utils/auth-helpers";

/**
 * Extends tenant-isolation coverage to the Phase 5 resources: follow-ups and
 * automations. Same requirement - a user in Organization A must never read or
 * act on Organization B's data, even with a known valid UUID.
 */
describe("Tenant isolation: automations/follow-ups", () => {
  let app: INestApplication;
  let ownerA: AuthedContext;
  let organizationAId: string;
  let organizationBId: string;
  let followUpBId: string;
  let automationBId: string;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);

    ownerA = await signupUser(app);
    const ownerB = await signupUser(app);

    const orgA = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ name: "Org A" })
      .expect(201);
    organizationAId = orgA.body.id;

    const orgB = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", ownerB.cookieHeader)
      .set("x-csrf-token", ownerB.csrfToken)
      .send({ name: "Org B" })
      .expect(201);
    organizationBId = orgB.body.id;

    const prisma = getPrisma(app);
    const contactB = await createTestContact(prisma, { organizationId: organizationBId });
    const pipelineB = await getOrCreateDefaultPipeline(prisma, organizationBId);
    const leadB = await prisma.lead.create({
      data: { organizationId: organizationBId, contactId: contactB.id, pipelineId: pipelineB.id, stageId: pipelineB.stages[0]!.id, title: "Org B lead" }
    });
    const followUpB = await createTestFollowUp(prisma, { organizationId: organizationBId, leadId: leadB.id });
    followUpBId = followUpB.id;

    const automationB = await createTestAutomation(prisma, { organizationId: organizationBId });
    automationBId = automationB.id;
  });

  it("blocks listing another organization's follow-ups", async () => {
    const res = await request(app.getHttpServer()).get(`/organizations/${organizationBId}/follow-ups`).set("Cookie", ownerA.cookieHeader).expect(403);
    expect(res.body).not.toContainEqual(expect.objectContaining({ id: followUpBId }));
  });

  it("blocks cancelling another organization's follow-up even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAId}/follow-ups/${followUpBId}/cancel`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .expect(404);
  });

  it("blocks listing another organization's automations", async () => {
    await request(app.getHttpServer()).get(`/organizations/${organizationBId}/automations`).set("Cookie", ownerA.cookieHeader).expect(403);
  });

  it("blocks reading another organization's automation even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/automations/${automationBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .expect(404);
  });

  it("blocks updating another organization's automation even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAId}/automations/${automationBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ enabled: false })
      .expect(404);
  });

  it("blocks deleting another organization's automation even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .delete(`/organizations/${organizationAId}/automations/${automationBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .expect(404);
  });
});

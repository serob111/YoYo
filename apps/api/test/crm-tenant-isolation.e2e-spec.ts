import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { createTestContact, createTestLead, createTestTag } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser, type AuthedContext } from "./utils/auth-helpers";

/**
 * Extends tenant-isolation.e2e-spec.ts's coverage to the Phase 4 CRM resources:
 * contacts, leads, pipeline, tasks, tags. Same requirement - a user in
 * Organization A must never read or act on Organization B's data, even with a
 * known valid UUID.
 */
describe("Tenant isolation: CRM resources", () => {
  let app: INestApplication;
  let ownerA: AuthedContext;
  let organizationAId: string;
  let organizationBId: string;
  let contactBId: string;
  let leadBId: string;
  let tagBId: string;

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
    contactBId = contactB.id;
    const pipelineB = await getOrCreateDefaultPipeline(prisma, organizationBId);
    const leadB = await createTestLead(prisma, {
      organizationId: organizationBId,
      contactId: contactBId,
      pipelineId: pipelineB.id,
      stageId: pipelineB.stages[0]!.id
    });
    leadBId = leadB.id;
    const tagB = await createTestTag(prisma, { organizationId: organizationBId });
    tagBId = tagB.id;
  });

  it("blocks listing another organization's contacts", async () => {
    await request(app.getHttpServer()).get(`/organizations/${organizationBId}/contacts`).set("Cookie", ownerA.cookieHeader).expect(403);
  });

  it("blocks reading another organization's contact even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/contacts/${contactBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .expect(404);
  });

  it("blocks reading another organization's pipeline", async () => {
    await request(app.getHttpServer()).get(`/organizations/${organizationBId}/pipeline`).set("Cookie", ownerA.cookieHeader).expect(403);
  });

  it("blocks listing another organization's leads", async () => {
    const res = await request(app.getHttpServer()).get(`/organizations/${organizationBId}/leads`).set("Cookie", ownerA.cookieHeader).expect(403);
    expect(res.body).not.toHaveProperty("items");
  });

  it("blocks reading another organization's lead even scoped under the caller's own org", async () => {
    await request(app.getHttpServer()).get(`/organizations/${organizationAId}/leads/${leadBId}`).set("Cookie", ownerA.cookieHeader).expect(404);
  });

  it("blocks moving another organization's lead to a new stage even scoped under the caller's own org", async () => {
    const prisma = getPrisma(app);
    const pipelineB = await getOrCreateDefaultPipeline(prisma, organizationBId);
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAId}/leads/${leadBId}/stage`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ stageId: pipelineB.stages[1]!.id })
      .expect(404);
  });

  it("blocks tagging another organization's lead with the caller's own tag", async () => {
    const prisma = getPrisma(app);
    const tagA = await createTestTag(prisma, { organizationId: organizationAId });
    await request(app.getHttpServer())
      .post(`/organizations/${organizationAId}/leads/${leadBId}/tags`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ tagId: tagA.id })
      .expect(404);
  });

  it("blocks tagging the caller's own lead with another organization's tag", async () => {
    const prisma = getPrisma(app);
    const contactA = await createTestContact(prisma, { organizationId: organizationAId });
    const pipelineA = await getOrCreateDefaultPipeline(prisma, organizationAId);
    const leadA = await createTestLead(prisma, {
      organizationId: organizationAId,
      contactId: contactA.id,
      pipelineId: pipelineA.id,
      stageId: pipelineA.stages[0]!.id
    });
    await request(app.getHttpServer())
      .post(`/organizations/${organizationAId}/leads/${leadA.id}/tags`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ tagId: tagBId })
      .expect(404);
  });

  it("blocks listing another organization's tags", async () => {
    const res = await request(app.getHttpServer()).get(`/organizations/${organizationBId}/tags`).set("Cookie", ownerA.cookieHeader).expect(403);
    expect(res.body).not.toContainEqual(expect.objectContaining({ id: tagBId }));
  });

  it("blocks deleting another organization's tag even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .delete(`/organizations/${organizationAId}/tags/${tagBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .expect(404);
  });

  it("blocks creating a task under another organization's lead even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${organizationAId}/tasks`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ leadId: leadBId, title: "Follow up" })
      .expect(404);
  });
});

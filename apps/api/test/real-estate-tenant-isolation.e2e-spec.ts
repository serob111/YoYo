import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { createTestContact, createTestLead, createTestProperty } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser, type AuthedContext } from "./utils/auth-helpers";

/**
 * Extends tenant-isolation.e2e-spec.ts / crm-tenant-isolation.e2e-spec.ts's
 * coverage to the vertical Phase 2 resources: properties, viewings, buyer
 * preferences. Same requirement - a user in Organization A must never read or
 * act on Organization B's data, even with a known valid UUID.
 */
describe("Tenant isolation: real estate resources", () => {
  let app: INestApplication;
  let ownerA: AuthedContext;
  let organizationAId: string;
  let organizationBId: string;
  let propertyBId: string;
  let leadBId: string;
  let contactBId: string;

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
    const propertyB = await createTestProperty(prisma, { organizationId: organizationBId });
    propertyBId = propertyB.id;

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
  });

  it("blocks listing another organization's properties", async () => {
    await request(app.getHttpServer()).get(`/organizations/${organizationBId}/properties`).set("Cookie", ownerA.cookieHeader).expect(403);
  });

  it("blocks reading another organization's property even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/properties/${propertyBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .expect(404);
  });

  it("blocks updating another organization's property even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAId}/properties/${propertyBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ title: "Hijacked listing", propertyType: "APARTMENT", transactionType: "SALE" })
      .expect(404);
  });

  it("blocks linking the caller's own lead to another organization's property", async () => {
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
      .post(`/organizations/${organizationAId}/properties/${propertyBId}/leads`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ leadId: leadA.id })
      .expect(404);
  });

  it("blocks linking another organization's lead to the caller's own property", async () => {
    const prisma = getPrisma(app);
    const propertyA = await createTestProperty(prisma, { organizationId: organizationAId });

    await request(app.getHttpServer())
      .post(`/organizations/${organizationAId}/properties/${propertyA.id}/leads`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ leadId: leadBId })
      .expect(404);
  });

  it("blocks scheduling a viewing against another organization's property", async () => {
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
      .post(`/organizations/${organizationAId}/viewings`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ propertyId: propertyBId, leadId: leadA.id, scheduledFor: new Date().toISOString() })
      .expect(404);
  });

  it("blocks reading another organization's contact's buyer preferences", async () => {
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/contacts/${contactBId}/buyer-preferences`)
      .query({ transactionType: "SALE" })
      .set("Cookie", ownerA.cookieHeader)
      .expect(404);
  });

  it("blocks setting buyer preferences on another organization's contact even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .put(`/organizations/${organizationAId}/contacts/${contactBId}/buyer-preferences`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ transactionType: "SALE", bedrooms: 2, districts: [] })
      .expect(404);
  });
});

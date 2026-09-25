import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { createTestConnectedAccount, createTestContact, createTestLead } from "@yoyo/testing";
import { TokenEncryptionService } from "@yoyo/crypto";
import { buildTestApp, getPrisma, resetTestDatabase } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

describe("Real-estate organization activation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
  });

  async function createOrganizationViaOnboarding(vertical?: string) {
    const owner = await signupUser(app);
    const res = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send(vertical ? { name: "Global Homes", vertical } : { name: "Plain Org" })
      .expect(201);
    return { owner, organizationId: res.body.id as string, vertical: res.body.vertical as string };
  }

  it("creates a real_estate organization when the onboarding route passes vertical explicitly", async () => {
    const { vertical } = await createOrganizationViaOnboarding("real_estate");
    expect(vertical).toBe("real_estate");
  });

  it("still defaults to core when vertical is omitted, so internal/testing org creation is unaffected", async () => {
    const { vertical } = await createOrganizationViaOnboarding(undefined);
    expect(vertical).toBe("core");
  });

  it("rejects an unregistered vertical id", async () => {
    const owner = await signupUser(app);
    await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Bad Org", vertical: "not_a_real_vertical" })
      .expect(400);
  });

  describe("setup-status", () => {
    it("derives each checklist item from existing data, with no properties/social/leads/matches yet", async () => {
      const { owner, organizationId } = await createOrganizationViaOnboarding("real_estate");

      const res = await request(app.getHttpServer()).get(`/organizations/${organizationId}/setup-status`).set("Cookie", owner.cookieHeader).expect(200);

      expect(res.body).toEqual({
        agencyCreated: true,
        inventoryConfigured: false,
        socialConnected: false,
        firstLeadProcessed: false,
        firstMatchReviewed: false,
        complete: false
      });
    });

    it("flips each item to true once the corresponding data exists, and complete once all are true", async () => {
      const { owner, organizationId } = await createOrganizationViaOnboarding("real_estate");
      const prisma = getPrisma(app);

      const property = await prisma.property.create({ data: { organizationId, title: "P1", propertyType: "APARTMENT" } });
      await createTestConnectedAccount(prisma, { organizationId, encryptedAccessToken: tokenEncryption.encrypt("t") });
      const contact = await createTestContact(prisma, { organizationId });
      const pipeline = await getOrCreateDefaultPipeline(prisma, organizationId);
      const lead = await createTestLead(prisma, { organizationId, contactId: contact.id, pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id });
      await prisma.leadProperty.create({ data: { leadId: lead.id, propertyId: property.id } });

      const res = await request(app.getHttpServer()).get(`/organizations/${organizationId}/setup-status`).set("Cookie", owner.cookieHeader).expect(200);

      expect(res.body).toEqual({
        agencyCreated: true,
        inventoryConfigured: true,
        socialConnected: true,
        firstLeadProcessed: true,
        firstMatchReviewed: true,
        complete: true
      });
    });

    it("is tenant-isolated: a member of one org cannot read another org's setup-status", async () => {
      const { owner: ownerA, organizationId: orgAId } = await createOrganizationViaOnboarding("real_estate");
      const { owner: ownerB, organizationId: orgBId } = await createOrganizationViaOnboarding("real_estate");

      await request(app.getHttpServer()).get(`/organizations/${orgAId}/setup-status`).set("Cookie", ownerB.cookieHeader).expect(403);
      await request(app.getHttpServer()).get(`/organizations/${orgBId}/setup-status`).set("Cookie", ownerA.cookieHeader).expect(403);
    });
  });
});

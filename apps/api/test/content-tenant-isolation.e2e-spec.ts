import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { TokenEncryptionService } from "@yoyo/crypto";
import { createTestConnectedAccount, createTestContentItem, createTestProperty } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser, type AuthedContext } from "./utils/auth-helpers";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

describe("Tenant isolation: content & media", () => {
  let app: INestApplication;
  let ownerA: AuthedContext;
  let organizationAId: string;
  let organizationBId: string;
  let contentItemBId: string;

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
    const accountB = await createTestConnectedAccount(prisma, { organizationId: organizationBId, encryptedAccessToken: tokenEncryption.encrypt("fake-token") });
    const contentItemB = await createTestContentItem(prisma, { organizationId: organizationBId, connectedAccountId: accountB.id });
    contentItemBId = contentItemB.id;
  });

  it("blocks listing another organization's content", async () => {
    await request(app.getHttpServer()).get(`/organizations/${organizationBId}/content`).set("Cookie", ownerA.cookieHeader).expect(403);
  });

  it("blocks reading another organization's content item even scoped under the caller's own org", async () => {
    await request(app.getHttpServer()).get(`/organizations/${organizationAId}/content/${contentItemBId}`).set("Cookie", ownerA.cookieHeader).expect(404);
  });

  it("blocks updating another organization's content item", async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAId}/content/${contentItemBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ caption: "Hijacked caption" })
      .expect(404);
  });

  it("blocks approving another organization's content item", async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${organizationAId}/content/${contentItemBId}/approve`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({})
      .expect(404);
  });

  it("blocks creating a content item linked to another organization's property", async () => {
    const prisma = getPrisma(app);
    const accountA = await createTestConnectedAccount(prisma, {
      organizationId: organizationAId,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token")
    });
    const propertyB = await createTestProperty(prisma, { organizationId: organizationBId });

    await request(app.getHttpServer())
      .post(`/organizations/${organizationAId}/content`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ connectedAccountId: accountA.id, postType: "IMAGE", propertyId: propertyB.id })
      .expect(404);
  });

  it("rejects a presigned-download request for a key that does not belong to the caller's organization", async () => {
    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/media/presigned-download`)
      .query({ key: `orgs/${organizationBId}/content/some-file.jpg` })
      .set("Cookie", ownerA.cookieHeader)
      .expect(403);
    expect(res.body.code).toBe("TENANT_ACCESS_DENIED");
  });
});

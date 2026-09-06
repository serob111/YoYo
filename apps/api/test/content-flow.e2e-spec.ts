import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { TokenEncryptionService } from "@yoyo/crypto";
import { createTestConnectedAccount } from "@yoyo/testing";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser, type AuthedContext } from "./utils/auth-helpers";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);
const PUBLISH_CAPABILITIES = { oauth: true, photoPublishing: true, videoPublishing: true, carouselPublishing: true };

describe("Content & publishing: draft/approval lifecycle", () => {
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

  async function seedOrgWithAccount() {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Test Bakery" })
      .expect(201);
    const organizationId: string = orgRes.body.id;

    const prisma = getPrisma(app);
    const connectedAccount = await createTestConnectedAccount(prisma, {
      organizationId,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token"),
      capabilities: PUBLISH_CAPABILITIES
    });
    return { owner, organizationId, connectedAccount };
  }

  function addMedia(owner: AuthedContext, organizationId: string, contentItemId: string, order = 0, kind: "IMAGE" | "VIDEO" = "IMAGE") {
    return request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${contentItemId}/media`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ order, kind, storageKey: `orgs/${organizationId}/content/fixture-${order}.jpg`, mimeType: "image/jpeg" });
  }

  it("takes a single-image post from draft through approval", async () => {
    const { owner, organizationId, connectedAccount } = await seedOrgWithAccount();

    const createRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ connectedAccountId: connectedAccount.id, postType: "IMAGE", caption: "Fresh bread today!" })
      .expect(201);
    expect(createRes.body.status).toBe("DRAFT");

    await addMedia(owner, organizationId, createRes.body.id).expect(201);

    const submitRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/submit`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(201);
    expect(submitRes.body.status).toBe("PENDING_APPROVAL");

    const approveRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/approve`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({})
      .expect(201);
    expect(approveRes.body.status).toBe("APPROVED");
    expect(approveRes.body.scheduledFor).not.toBeNull();
  });

  it("rejects submitting a draft with no caption", async () => {
    const { owner, organizationId, connectedAccount } = await seedOrgWithAccount();
    const createRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ connectedAccountId: connectedAccount.id, postType: "IMAGE" })
      .expect(201);
    await addMedia(owner, organizationId, createRes.body.id).expect(201);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/submit`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(409);
  });

  it("rejects submitting an IMAGE post with a mismatched-kind asset", async () => {
    const { owner, organizationId, connectedAccount } = await seedOrgWithAccount();
    const createRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ connectedAccountId: connectedAccount.id, postType: "IMAGE", caption: "Caption" })
      .expect(201);
    await addMedia(owner, organizationId, createRes.body.id, 0, "VIDEO").expect(201);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/submit`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(409);
  });

  it("requires 2-10 assets for a CAROUSEL post", async () => {
    const { owner, organizationId, connectedAccount } = await seedOrgWithAccount();
    const createRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ connectedAccountId: connectedAccount.id, postType: "CAROUSEL", caption: "Look at all these pastries" })
      .expect(201);
    await addMedia(owner, organizationId, createRes.body.id, 0).expect(201);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/submit`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(409);

    await addMedia(owner, organizationId, createRes.body.id, 1).expect(201);
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/submit`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(201);
  });

  it("rejects approving against a connected account without publishing permission", async () => {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "No Publish Perms" })
      .expect(201);
    const organizationId: string = orgRes.body.id;
    const prisma = getPrisma(app);
    // Default fixture capabilities have no publishing flags - simulates an
    // account connected before the instagram_business_content_publish scope existed.
    const connectedAccount = await createTestConnectedAccount(prisma, { organizationId, encryptedAccessToken: tokenEncryption.encrypt("fake-token") });

    const createRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ connectedAccountId: connectedAccount.id, postType: "IMAGE", caption: "Caption" })
      .expect(201);
    await addMedia(owner, organizationId, createRes.body.id).expect(201);
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/submit`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/approve`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({})
      .expect(409);
  });

  it("rejects a submitted draft with a reason", async () => {
    const { owner, organizationId, connectedAccount } = await seedOrgWithAccount();
    const createRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ connectedAccountId: connectedAccount.id, postType: "IMAGE", caption: "Caption" })
      .expect(201);
    await addMedia(owner, organizationId, createRes.body.id).expect(201);
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/submit`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(201);

    const rejectRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/reject`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ reason: "Blurry photo" })
      .expect(201);
    expect(rejectRes.body.status).toBe("REJECTED");
    expect(rejectRes.body.rejectionReason).toBe("Blurry photo");
  });

  it("cancels a draft before it's ever submitted", async () => {
    const { owner, organizationId, connectedAccount } = await seedOrgWithAccount();
    const createRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ connectedAccountId: connectedAccount.id, postType: "IMAGE", caption: "Caption" })
      .expect(201);

    const cancelRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/content/${createRes.body.id}/cancel`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .expect(201);
    expect(cancelRes.body.status).toBe("CANCELLED");
  });
});

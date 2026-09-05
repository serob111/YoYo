import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createTestConnectedAccount } from "@yoyo/testing";
import { TokenEncryptionService } from "@yoyo/crypto";
import { normalizeWebhookEvent } from "@yoyo/worker-webhooks";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser, type AuthedContext } from "./utils/auth-helpers";
import { signWebhookBody } from "./utils/webhook-signing";
import { instagramTextWebhookPayload } from "./utils/instagram-webhook-fixtures";

const APP_SECRET = "test-app-secret";
const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

/**
 * Extends tenant-isolation.e2e-spec.ts's coverage to the Phase 2 resources:
 * connected accounts, conversations, and messages. Same requirement as
 * Phase 1 - a user in Organization A must never read or act on Organization
 * B's data, even with a known valid UUID.
 */
describe("Tenant isolation: messaging resources", () => {
  let app: INestApplication;
  let ownerA: AuthedContext;
  let organizationAId: string;
  let organizationBId: string;
  let connectedAccountBId: string;
  let conversationBId: string;

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
    const connectedAccountExternalId = "ig-org-b-account";
    const connectedAccount = await createTestConnectedAccount(prisma, {
      organizationId: organizationBId,
      externalAccountId: connectedAccountExternalId,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token")
    });
    connectedAccountBId = connectedAccount.id;

    const body = JSON.stringify(instagramTextWebhookPayload({ connectedAccountExternalId, senderId: "cust-b", mid: "mid.org-b-1", text: "hi" }));
    await request(app.getHttpServer())
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", signWebhookBody(body, APP_SECRET))
      .send(body)
      .expect(200);
    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({ where: { provider_externalEventId: { provider: "INSTAGRAM", externalEventId: "mid.org-b-1" } } });
    await normalizeWebhookEvent(prisma, event.id);
    const conversation = await prisma.conversation.findFirstOrThrow({ where: { organizationId: organizationBId } });
    conversationBId = conversation.id;
  });

  it("blocks listing another organization's connected accounts", async () => {
    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationBId}/integrations`)
      .set("Cookie", ownerA.cookieHeader)
      .expect(403);
    expect(res.body).not.toHaveProperty("items");
  });

  it("blocks disconnecting another organization's connected account even scoped under the caller's own org", async () => {
    // ownerA IS an active member of organizationA, so TenantContextGuard passes -
    // the cross-org connectedAccountId must still be rejected by the service.
    await request(app.getHttpServer())
      .delete(`/organizations/${organizationAId}/integrations/${connectedAccountBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .expect(404);
  });

  it("blocks listing another organization's conversations", async () => {
    const res = await request(app.getHttpServer())
      .get(`/organizations/${organizationBId}/conversations`)
      .set("Cookie", ownerA.cookieHeader)
      .expect(403);
    expect(res.body).not.toHaveProperty("items");
  });

  it("blocks reading another organization's conversation messages even scoped under the caller's own org", async () => {
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/conversations/${conversationBId}/messages`)
      .set("Cookie", ownerA.cookieHeader)
      .expect(404);
  });

  it("blocks sending a message into another organization's conversation", async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${organizationAId}/conversations/${conversationBId}/messages`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ text: "intrusion attempt" })
      .expect(404);
  });

  it("blocks assigning another organization's conversation", async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAId}/conversations/${conversationBId}`)
      .set("Cookie", ownerA.cookieHeader)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ assignedUserId: null })
      .expect(404);
  });
});

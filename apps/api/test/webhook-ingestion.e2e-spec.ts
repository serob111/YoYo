import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createOrgWithOwner, createTestConnectedAccount } from "@yoyo/testing";
import { TokenEncryptionService } from "@yoyo/crypto";
import { normalizeWebhookEvent } from "@yoyo/worker-webhooks";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signWebhookBody } from "./utils/webhook-signing";
import { instagramTextWebhookPayload } from "./utils/instagram-webhook-fixtures";

const APP_SECRET = "test-app-secret";
const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

describe("Instagram webhook ingestion", () => {
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

  // Not `async` - wrapping supertest's Test in an async function's implicit
  // Promise erases its chainable .expect() methods, leaving only Promise<Response>.
  function postWebhook(payload: unknown) {
    const body = JSON.stringify(payload);
    return request(app.getHttpServer())
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", signWebhookBody(body, APP_SECRET))
      .send(body);
  }

  it("responds to the subscription verification handshake", async () => {
    const res = await request(app.getHttpServer())
      .get("/webhooks/instagram")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "test-verify-token", "hub.challenge": "12345" })
      .expect(200);
    expect(res.text).toBe("12345");
  });

  it("rejects the handshake with the wrong verify token", async () => {
    await request(app.getHttpServer())
      .get("/webhooks/instagram")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "wrong-token", "hub.challenge": "12345" })
      .expect(403);
  });

  it("rejects a POST with an invalid signature", async () => {
    const payload = instagramTextWebhookPayload({ connectedAccountExternalId: "ig-1", senderId: "cust-1", mid: "mid.1", text: "hi" });
    await request(app.getHttpServer())
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send(JSON.stringify(payload))
      .expect(403);
  });

  it("deduplicates the same webhook delivered 5 times into exactly one Message", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const connectedAccountExternalId = "ig-account-1";
    await createTestConnectedAccount(prisma, {
      organizationId: organization.id,
      externalAccountId: connectedAccountExternalId,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token")
    });

    const payload = instagramTextWebhookPayload({ connectedAccountExternalId, senderId: "customer-igsid-1", mid: "mid.duplicate-test", text: "How much for the cake?" });

    for (let i = 0; i < 5; i++) {
      await postWebhook(payload).expect(200);
    }

    const events = await prisma.providerWebhookEvent.findMany({ where: { externalEventId: "mid.duplicate-test" } });
    expect(events).toHaveLength(1);

    const result = await normalizeWebhookEvent(prisma, events[0]!.id);
    expect(result).toBe("processed");

    const messages = await prisma.message.findMany({ where: { providerMessageId: "mid.duplicate-test" } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ direction: "INBOUND", senderType: "CUSTOMER", text: "How much for the cake?" });
  });

  it("two concurrent normalization calls against the same event still produce exactly one Message", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const connectedAccountExternalId = "ig-account-2";
    await createTestConnectedAccount(prisma, {
      organizationId: organization.id,
      externalAccountId: connectedAccountExternalId,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token")
    });

    const payload = instagramTextWebhookPayload({ connectedAccountExternalId, senderId: "customer-igsid-2", mid: "mid.concurrency-test", text: "Hello" });
    await postWebhook(payload).expect(200);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({ where: { provider_externalEventId: { provider: "INSTAGRAM", externalEventId: "mid.concurrency-test" } } });

    const [a, b] = await Promise.all([normalizeWebhookEvent(prisma, event.id), normalizeWebhookEvent(prisma, event.id)]);
    expect([a, b].sort()).toEqual(["processed", "skipped"]);

    const messages = await prisma.message.findMany({ where: { providerMessageId: "mid.concurrency-test" } });
    expect(messages).toHaveLength(1);
  });

  it("ignores echo events (our own outbound message bouncing back) without creating an inbound Message", async () => {
    const prisma = getPrisma(app);
    const { organization } = await createOrgWithOwner(prisma);
    const connectedAccountExternalId = "ig-account-3";
    await createTestConnectedAccount(prisma, {
      organizationId: organization.id,
      externalAccountId: connectedAccountExternalId,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token")
    });

    const payload = instagramTextWebhookPayload({ connectedAccountExternalId, senderId: "customer-igsid-3", mid: "mid.echo-test", text: "Our own reply", isEcho: true });
    await postWebhook(payload).expect(200);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({ where: { provider_externalEventId: { provider: "INSTAGRAM", externalEventId: "mid.echo-test" } } });
    const result = await normalizeWebhookEvent(prisma, event.id);
    expect(result).toBe("ignored");

    const messages = await prisma.message.findMany({ where: { providerMessageId: "mid.echo-test" } });
    expect(messages).toHaveLength(0);
  });

  it("stores an event for an unknown connected account as IGNORED rather than dropping it silently", async () => {
    const payload = instagramTextWebhookPayload({ connectedAccountExternalId: "ig-nobody-connected-this", senderId: "cust", mid: "mid.unknown-account", text: "hi" });
    await postWebhook(payload).expect(200);

    const prisma = getPrisma(app);
    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({ where: { provider_externalEventId: { provider: "INSTAGRAM", externalEventId: "mid.unknown-account" } } });
    expect(event.status).toBe("IGNORED");
    expect(event.organizationId).toBeNull();
  });
});

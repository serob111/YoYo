import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createTestConnectedAccount } from "@yoyo/testing";
import { TokenEncryptionService } from "@yoyo/crypto";
import { ProviderApiError, type ConnectedAccountRef, type MessagingProvider, type ProviderSendResult } from "@yoyo/integrations";
import { normalizeWebhookEvent } from "@yoyo/worker-webhooks";
import { sendPendingMessage } from "@yoyo/worker-messaging";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";
import { signWebhookBody } from "./utils/webhook-signing";
import { instagramTextWebhookPayload } from "./utils/instagram-webhook-fixtures";

const APP_SECRET = "test-app-secret";
const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

class ScriptedMessagingProvider implements MessagingProvider {
  constructor(private readonly impl: (account: ConnectedAccountRef, recipientExternalId: string, text: string) => Promise<ProviderSendResult>) {}
  sendText(account: ConnectedAccountRef, recipientExternalId: string, text: string): Promise<ProviderSendResult> {
    return this.impl(account, recipientExternalId, text);
  }
}

describe("Unified inbox: conversations, messages, outbound send", () => {
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

  async function seedInboundConversation() {
    const prisma = getPrisma(app);
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Test Bakery" })
      .expect(201);
    const organizationId: string = orgRes.body.id;

    const connectedAccountExternalId = "ig-inbox-account";
    const connectedAccount = await createTestConnectedAccount(prisma, {
      organizationId,
      externalAccountId: connectedAccountExternalId,
      encryptedAccessToken: tokenEncryption.encrypt("fake-token")
    });

    const body = JSON.stringify(
      instagramTextWebhookPayload({ connectedAccountExternalId, senderId: "customer-igsid-x", mid: "mid.seed-1", text: "Are you open today?" })
    );
    await request(app.getHttpServer())
      .post("/webhooks/instagram")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", signWebhookBody(body, APP_SECRET))
      .send(body)
      .expect(200);

    const event = await prisma.providerWebhookEvent.findUniqueOrThrow({ where: { provider_externalEventId: { provider: "INSTAGRAM", externalEventId: "mid.seed-1" } } });
    await normalizeWebhookEvent(prisma, event.id);

    const conversation = await prisma.conversation.findFirstOrThrow({ where: { organizationId } });
    return { owner, organizationId, connectedAccount, conversation };
  }

  it("surfaces an inbound message through the conversations and messages read APIs", async () => {
    const { owner, organizationId, conversation } = await seedInboundConversation();

    const conversationsRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/conversations`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(conversationsRes.body.items).toHaveLength(1);
    expect(conversationsRes.body.items[0].id).toBe(conversation.id);

    const messagesRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/conversations/${conversation.id}/messages`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(messagesRes.body.items).toHaveLength(1);
    expect(messagesRes.body.items[0]).toMatchObject({ direction: "INBOUND", text: "Are you open today?" });
  });

  it("creates a PENDING outbound message and an outbox row when an agent replies", async () => {
    const { owner, organizationId, conversation } = await seedInboundConversation();
    const prisma = getPrisma(app);

    const sendRes = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/conversations/${conversation.id}/messages`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ text: "Yes, open until 6pm!" })
      .expect(201);

    expect(sendRes.body.status).toBe("PENDING");
    expect(sendRes.body.direction).toBe("OUTBOUND");

    const outboxRows = await prisma.outboxEvent.findMany({ where: { aggregateId: sendRes.body.id } });
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]?.eventType).toBe("message.outbound_pending");
  });

  it("rejects sending against a connected account that needs reconnecting", async () => {
    const { owner, organizationId, conversation, connectedAccount } = await seedInboundConversation();
    const prisma = getPrisma(app);
    await prisma.connectedAccount.update({ where: { id: connectedAccount.id }, data: { status: "ACTION_REQUIRED" } });

    const res = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/conversations/${conversation.id}/messages`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ text: "Hello" })
      .expect(409);
    expect(res.body.code).toBe("INTEGRATION_DISCONNECTED");
  });

  describe("worker-messaging send outcomes (mocked provider HTTP boundary)", () => {
    it("marks a message SENT on success", async () => {
      const { organizationId, conversation } = await seedInboundConversation();
      const prisma = getPrisma(app);
      const message = await prisma.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          connectedAccountId: conversation.connectedAccountId,
          provider: "INSTAGRAM",
          direction: "OUTBOUND",
          senderType: "HUMAN",
          messageType: "TEXT",
          text: "On our way!",
          status: "PENDING"
        }
      });

      const provider = new ScriptedMessagingProvider(async () => ({ providerMessageId: "sent-mid-123" }));
      const result = await sendPendingMessage(prisma, tokenEncryption, provider, message.id);

      expect(result).toBe("sent");
      const updated = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(updated.status).toBe("SENT");
      expect(updated.providerMessageId).toBe("sent-mid-123");
    });

    it("marks ACTION_REQUIRED failures as FAILED and flips the connected account to ACTION_REQUIRED", async () => {
      const { organizationId, conversation, connectedAccount } = await seedInboundConversation();
      const prisma = getPrisma(app);
      const message = await prisma.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          connectedAccountId: conversation.connectedAccountId,
          provider: "INSTAGRAM",
          direction: "OUTBOUND",
          senderType: "HUMAN",
          messageType: "TEXT",
          text: "Hi",
          status: "PENDING"
        }
      });

      const provider = new ScriptedMessagingProvider(async () => {
        throw new ProviderApiError("Token expired", "ACTION_REQUIRED", 401, 190);
      });
      const result = await sendPendingMessage(prisma, tokenEncryption, provider, message.id);

      expect(result).toBe("failed");
      const updatedMessage = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(updatedMessage.status).toBe("FAILED");
      const updatedAccount = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: connectedAccount.id } });
      expect(updatedAccount.status).toBe("ACTION_REQUIRED");
    });

    it("reverts RETRYABLE failures to PENDING and rethrows so the queue can retry", async () => {
      const { organizationId, conversation } = await seedInboundConversation();
      const prisma = getPrisma(app);
      const message = await prisma.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          connectedAccountId: conversation.connectedAccountId,
          provider: "INSTAGRAM",
          direction: "OUTBOUND",
          senderType: "HUMAN",
          messageType: "TEXT",
          text: "Hi",
          status: "PENDING"
        }
      });

      const provider = new ScriptedMessagingProvider(async () => {
        throw new ProviderApiError("Rate limited", "RETRYABLE", 429);
      });

      await expect(sendPendingMessage(prisma, tokenEncryption, provider, message.id)).rejects.toThrow("Rate limited");

      const updated = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(updated.status).toBe("PENDING");
    });

    it("does not double-send when two workers claim the same message concurrently", async () => {
      const { organizationId, conversation } = await seedInboundConversation();
      const prisma = getPrisma(app);
      const message = await prisma.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          connectedAccountId: conversation.connectedAccountId,
          provider: "INSTAGRAM",
          direction: "OUTBOUND",
          senderType: "HUMAN",
          messageType: "TEXT",
          text: "Hi",
          status: "PENDING"
        }
      });

      let callCount = 0;
      const provider = new ScriptedMessagingProvider(async () => {
        callCount += 1;
        return { providerMessageId: "only-once" };
      });

      const [a, b] = await Promise.all([
        sendPendingMessage(prisma, tokenEncryption, provider, message.id),
        sendPendingMessage(prisma, tokenEncryption, provider, message.id)
      ]);

      expect(callCount).toBe(1);
      expect([a, b].sort()).toEqual(["sent", "skipped"]);
    });
  });
});

import type { PrismaClient } from "@yoyo/database";
import { extractNormalizedInboundMessages, type InstagramWebhookPayload } from "@yoyo/integrations";

export type NormalizeResult = "processed" | "ignored" | "skipped" | "not_found";

/**
 * Normalizes one stored ProviderWebhookEvent into Contact/Conversation/Message
 * rows. Exported as a plain function (not tied to BullMQ) so both the worker
 * entrypoint (src/index.ts) and integration tests can call it directly - the
 * concurrency tests invoke this twice against the same row to prove the claim
 * step below makes double-processing impossible.
 */
export async function normalizeWebhookEvent(prisma: PrismaClient, providerWebhookEventId: string): Promise<NormalizeResult> {
  // Atomic claim: only one caller can move RECEIVED -> PROCESSING for a given
  // row. A second concurrent call (two workers, or a retried job) sees 0 rows
  // affected and backs off immediately - this is what makes "two workers
  // process the same webhook" safe, mirroring AuthTokenService's single-use
  // consume pattern from Phase 1.
  const claimed = await prisma.providerWebhookEvent.updateMany({
    where: { id: providerWebhookEventId, status: "RECEIVED" },
    data: { status: "PROCESSING" }
  });
  if (claimed.count === 0) {
    return "skipped";
  }

  const row = await prisma.providerWebhookEvent.findUnique({ where: { id: providerWebhookEventId } });
  if (!row) {
    return "not_found";
  }
  if (!row.connectedAccountId || !row.organizationId) {
    await prisma.providerWebhookEvent.update({ where: { id: row.id }, data: { status: "IGNORED", processedAt: new Date() } });
    return "ignored";
  }

  const [normalized] = extractNormalizedInboundMessages(row.payload as unknown as InstagramWebhookPayload);
  if (!normalized || normalized.isEcho) {
    // Echoes are our own outbound sends bouncing back through the webhook -
    // already recorded via the send flow, so there is nothing more to do here.
    await prisma.providerWebhookEvent.update({ where: { id: row.id }, data: { status: "IGNORED", processedAt: new Date() } });
    return "ignored";
  }

  const organizationId = row.organizationId;
  const connectedAccountId = row.connectedAccountId;

  await prisma.$transaction(async (tx) => {
    let identity = await tx.contactIdentity.findUnique({
      where: { provider_connectedAccountId_externalId: { provider: "INSTAGRAM", connectedAccountId, externalId: normalized.senderExternalId } }
    });

    if (!identity) {
      const contact = await tx.contact.create({
        data: { organizationId, displayName: normalized.senderExternalId }
      });
      identity = await tx.contactIdentity.create({
        data: { contactId: contact.id, provider: "INSTAGRAM", connectedAccountId, externalId: normalized.senderExternalId }
      });
    }

    // New conversations only start AI-driven if the org has turned AI on -
    // otherwise they default to HUMAN_ACTIVE (the Conversation model's own
    // default), matching Phase 3's "AI is opt-in per org" design.
    const businessProfile = await tx.businessProfile.findUnique({ where: { organizationId } });
    const conversation = await tx.conversation.upsert({
      where: { connectedAccountId_contactId: { connectedAccountId, contactId: identity.contactId } },
      create: {
        organizationId,
        connectedAccountId,
        contactId: identity.contactId,
        provider: "INSTAGRAM",
        lastMessageAt: normalized.occurredAt,
        automationState: businessProfile?.aiEnabled ? "AI_ACTIVE" : "HUMAN_ACTIVE"
      },
      update: { lastMessageAt: normalized.occurredAt }
    });

    const message = await tx.message.create({
      data: {
        organizationId,
        conversationId: conversation.id,
        connectedAccountId,
        provider: "INSTAGRAM",
        providerMessageId: normalized.externalEventId,
        direction: "INBOUND",
        senderType: "CUSTOMER",
        messageType: normalized.messageType,
        text: normalized.text,
        // Inbound messages are, by definition, already fully received - the
        // PENDING/SENDING/SENT states in this enum describe OUR outbound
        // delivery lifecycle and don't apply here.
        status: "DELIVERED",
        providerTimestamp: normalized.occurredAt,
        metadata: normalized.attachmentUrls.length > 0 ? { attachmentUrls: normalized.attachmentUrls } : {}
      }
    });

    // Inlined rather than importing apps/api's OutboxService - it's a single
    // Prisma insert and workers don't import from other apps. See ADR-0004.
    await tx.outboxEvent.create({
      data: {
        organizationId,
        aggregateType: "Message",
        aggregateId: message.id,
        eventType: "message.inbound_received",
        payload: { conversationId: conversation.id, requestId: "webhook-normalize" }
      }
    });

    await tx.providerWebhookEvent.update({ where: { id: row.id }, data: { status: "PROCESSED", processedAt: new Date() } });
  });

  return "processed";
}

import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { SampleLeadInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { OutboxService } from "../common/outbox.service";
import { RequestContext } from "../common/request-context";
import { ConflictDomainError } from "../common/domain-errors";

/**
 * Exercises the REAL inbound pipeline (Contact/Conversation/Message +
 * message.inbound_received outbox event -> worker-ai's generateAiReply),
 * not a parallel fake AI/CRM path - see apps/worker-webhooks/src/normalize.ts
 * for the production write shape this mirrors.
 *
 * Isolation from real inbound webhooks is structural, not a code fork: this
 * is its own endpoint/service, and the demo Contact deliberately gets no
 * ContactIdentity row, so worker-messaging's later attempt to send the AI's
 * reply back out finds no identity to send to and marks it FAILED gracefully
 * (see apps/worker-messaging/src/send.ts) - no real Instagram/TikTok API
 * call is ever made for a demo message.
 */
@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  async sendSampleLead(organizationId: string, input: SampleLeadInput) {
    const connectedAccount = await this.prisma.client.connectedAccount.findFirst({
      where: { organizationId, status: "CONNECTED" },
      orderBy: { createdAt: "asc" }
    });
    if (!connectedAccount) {
      throw new ConflictDomainError("Connect Instagram or TikTok before trying a sample lead.");
    }

    const requestId = RequestContext.current()?.requestId ?? "demo";

    return this.prisma.client.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: { organizationId, displayName: "Sample Lead (Demo)" }
      });

      const conversation = await tx.conversation.create({
        data: {
          organizationId,
          connectedAccountId: connectedAccount.id,
          contactId: contact.id,
          provider: connectedAccount.provider,
          // Forced AI_ACTIVE regardless of BusinessProfile.aiEnabled - this
          // demo exists specifically to show the AI qualification flow, even
          // for an org that hasn't turned AI on for real conversations yet.
          automationState: "AI_ACTIVE",
          lastMessageAt: new Date()
        }
      });

      const message = await tx.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          connectedAccountId: connectedAccount.id,
          provider: connectedAccount.provider,
          providerMessageId: `demo-${randomUUID()}`,
          direction: "INBOUND",
          senderType: "CUSTOMER",
          messageType: "TEXT",
          text: input.message,
          status: "DELIVERED",
          providerTimestamp: new Date()
        }
      });

      await this.outbox.record(tx, {
        organizationId,
        aggregateType: "Message",
        aggregateId: message.id,
        eventType: "message.inbound_received",
        payload: { conversationId: conversation.id, requestId }
      });

      return { conversationId: conversation.id, contactId: contact.id, messageId: message.id };
    });
  }
}

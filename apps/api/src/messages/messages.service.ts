import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { OutboxService } from "../common/outbox.service";
import { IntegrationDisconnectedError, NotFoundDomainError } from "../common/domain-errors";
import { RequestContext } from "../common/request-context";
import { ConversationsService } from "../conversations/conversations.service";

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly conversations: ConversationsService
  ) {}

  async list(organizationId: string, conversationId: string, cursor?: string, take = 50) {
    await this.conversations.getOrThrow(organizationId, conversationId);

    const messages = await this.prisma.client.message.findMany({
      where: { organizationId, conversationId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    const hasMore = messages.length > take;
    const page = hasMore ? messages.slice(0, take) : messages;
    return {
      items: page.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        direction: m.direction,
        senderType: m.senderType,
        messageType: m.messageType,
        text: m.text,
        status: m.status,
        providerTimestamp: m.providerTimestamp,
        createdAt: m.createdAt
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null
    };
  }

  async send(organizationId: string, conversationId: string, actorUserId: string, text: string) {
    const conversation = await this.conversations.getOrThrow(organizationId, conversationId);

    const connectedAccount = await this.prisma.client.connectedAccount.findUnique({
      where: { id: conversation.connectedAccountId }
    });
    if (!connectedAccount || connectedAccount.organizationId !== organizationId) {
      throw new NotFoundDomainError("Connected account");
    }
    if (connectedAccount.status !== "CONNECTED") {
      // Never silently queue a send against a broken connection - fail the
      // request so the agent knows to reconnect, per the brief's send-path rules.
      throw new IntegrationDisconnectedError();
    }

    const requestId = RequestContext.current()?.requestId ?? "api";

    return this.prisma.client.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          organizationId,
          conversationId,
          connectedAccountId: connectedAccount.id,
          provider: connectedAccount.provider,
          direction: "OUTBOUND",
          senderType: "HUMAN",
          senderUserId: actorUserId,
          messageType: "TEXT",
          text,
          status: "PENDING"
        }
      });

      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

      await this.outbox.record(tx, {
        organizationId,
        aggregateType: "Message",
        aggregateId: message.id,
        eventType: "message.outbound_pending",
        payload: { requestId }
      });

      return message;
    });
  }
}

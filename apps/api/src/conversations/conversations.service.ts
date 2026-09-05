import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(organizationId: string, cursor?: string, take = 30) {
    const conversations = await this.prisma.client.conversation.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { contact: { select: { displayName: true } } }
    });

    const hasMore = conversations.length > take;
    const page = hasMore ? conversations.slice(0, take) : conversations;
    return {
      items: page.map((c) => ({
        id: c.id,
        contactId: c.contactId,
        contactDisplayName: c.contact.displayName,
        connectedAccountId: c.connectedAccountId,
        provider: c.provider,
        assignedUserId: c.assignedUserId,
        automationState: c.automationState,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null
    };
  }

  async getOrThrow(organizationId: string, conversationId: string) {
    const conversation = await this.prisma.client.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.organizationId !== organizationId) {
      throw new NotFoundDomainError("Conversation");
    }
    return conversation;
  }

  async assign(organizationId: string, conversationId: string, assignedUserId: string | null, actorId: string) {
    const conversation = await this.getOrThrow(organizationId, conversationId);

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.conversation.update({ where: { id: conversationId }, data: { assignedUserId } });
      await this.audit.record(
        {
          organizationId,
          actorId,
          action: assignedUserId ? "conversation.assigned" : "conversation.unassigned",
          entityType: "Conversation",
          entityId: conversationId,
          metadata: { from: conversation.assignedUserId, to: assignedUserId }
        },
        tx
      );
      return updated;
    });
  }
}

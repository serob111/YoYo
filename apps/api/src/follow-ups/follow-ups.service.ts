import { Injectable } from "@nestjs/common";
import { resolveNextSendTime } from "@yoyo/database";
import type { Prisma } from "@yoyo/database";
import type { CreateFollowUpInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { ConflictDomainError, NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, leadId?: string) {
    return this.prisma.client.followUp.findMany({
      where: { organizationId, ...(leadId ? { leadId } : {}) },
      orderBy: { scheduledFor: "asc" }
    });
  }

  async getOrThrow(organizationId: string, followUpId: string) {
    const followUp = await this.prisma.client.followUp.findUnique({ where: { id: followUpId } });
    if (!followUp || followUp.organizationId !== organizationId) throw new NotFoundDomainError("Follow-up");
    return followUp;
  }

  async create(organizationId: string, actorUserId: string, input: CreateFollowUpInput) {
    const lead = await this.prisma.client.lead.findUnique({ where: { id: input.leadId } });
    if (!lead || lead.organizationId !== organizationId) throw new NotFoundDomainError("Lead");

    const businessProfile = await this.prisma.client.businessProfile.findUnique({ where: { organizationId } });
    const scheduledFor = resolveNextSendTime(new Date(input.sendAt), businessProfile?.timezone ?? "UTC", businessProfile?.businessHours ?? null);

    const actionConfig: Prisma.InputJsonValue =
      input.actionType === "SEND_MESSAGE" ? { text: input.text } : { title: input.title, description: input.description ?? null };

    return this.prisma.client.followUp.create({
      data: {
        organizationId,
        leadId: input.leadId,
        actionType: input.actionType,
        actionConfig,
        scheduledFor,
        createdByUserId: actorUserId
      }
    });
  }

  async cancel(organizationId: string, followUpId: string) {
    const followUp = await this.getOrThrow(organizationId, followUpId);
    if (followUp.status !== "PENDING") throw new ConflictDomainError("This follow-up is no longer pending and can't be cancelled.");
    return this.prisma.client.followUp.update({
      where: { id: followUpId },
      data: { status: "CANCELLED", cancelledAt: new Date() }
    });
  }
}

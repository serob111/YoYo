import { Injectable } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { leadIntentSchema, type UpdateLeadInput, type UpsertLeadInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { OutboxService } from "../common/outbox.service";
import { RequestContext } from "../common/request-context";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  async list(organizationId: string, filters: { stageId?: string; contactId?: string; search?: string; intent?: string }, cursor?: string, take = 30) {
    // Invalid/unrecognized intent values are ignored rather than rejected -
    // this is a list filter, not a write path, so a stale/garbage query param
    // should just behave like "no filter" instead of erroring the page.
    const intent = leadIntentSchema.safeParse(filters.intent);

    const leads = await this.prisma.client.lead.findMany({
      where: {
        organizationId,
        ...(filters.stageId ? { stageId: filters.stageId } : {}),
        ...(filters.contactId ? { contactId: filters.contactId } : {}),
        ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" } } : {}),
        ...(intent.success ? { intent: intent.data } : {})
      },
      orderBy: { updatedAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { contact: { select: { displayName: true } } }
    });

    const hasMore = leads.length > take;
    const page = hasMore ? leads.slice(0, take) : leads;
    return {
      items: page.map(({ contact, ...lead }) => ({ ...lead, contactDisplayName: contact.displayName })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null
    };
  }

  async getOrThrow(organizationId: string, leadId: string) {
    const lead = await this.prisma.client.lead.findUnique({
      where: { id: leadId },
      include: {
        activities: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: { createdAt: "desc" } },
        tags: { include: { tag: true } }
      }
    });
    if (!lead || lead.organizationId !== organizationId) throw new NotFoundDomainError("Lead");
    return lead;
  }

  async create(organizationId: string, input: UpsertLeadInput) {
    const contact = await this.prisma.client.contact.findUnique({ where: { id: input.contactId } });
    if (!contact || contact.organizationId !== organizationId) throw new NotFoundDomainError("Contact");

    const pipeline = await getOrCreateDefaultPipeline(this.prisma.client, organizationId);
    const firstStage = pipeline.stages[0];
    if (!firstStage) throw new Error("Default pipeline was created with no stages - this should never happen");

    const requestId = RequestContext.current()?.requestId ?? "api";

    return this.prisma.client.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          organizationId,
          contactId: input.contactId,
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          title: input.title,
          intent: input.intent ?? null,
          valueCents: input.valueCents ?? null,
          currency: input.currency,
          assignedUserId: input.assignedUserId ?? null
        }
      });

      await this.outbox.record(tx, {
        organizationId,
        aggregateType: "Lead",
        aggregateId: lead.id,
        eventType: "lead.created",
        payload: { requestId }
      });

      return lead;
    });
  }

  async update(organizationId: string, leadId: string, input: UpdateLeadInput) {
    await this.getOrThrow(organizationId, leadId);
    return this.prisma.client.lead.update({
      where: { id: leadId },
      data: {
        title: input.title,
        intent: input.intent ?? null,
        valueCents: input.valueCents ?? null,
        currency: input.currency,
        assignedUserId: input.assignedUserId ?? null
      }
    });
  }

  async moveStage(organizationId: string, leadId: string, stageId: string) {
    const lead = await this.getOrThrow(organizationId, leadId);
    const stage = await this.prisma.client.pipelineStage.findUnique({ where: { id: stageId } });
    if (!stage || stage.pipelineId !== lead.pipelineId) throw new NotFoundDomainError("Pipeline stage");

    const requestId = RequestContext.current()?.requestId ?? "api";
    const isClosing = stage.isWon || stage.isLost;

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: leadId },
        data: { stageId, closedAt: isClosing ? new Date() : null }
      });
      await tx.activity.create({
        data: { organizationId, leadId, type: "STAGE_CHANGE", content: `Stage changed to ${stage.name}` }
      });

      // Don't follow up on a deal that's now closed.
      if (isClosing) {
        await tx.followUp.updateMany({
          where: { leadId, status: "PENDING" },
          data: { status: "CANCELLED", cancelledAt: new Date() }
        });
      }

      await this.outbox.record(tx, {
        organizationId,
        aggregateType: "Lead",
        aggregateId: leadId,
        eventType: "lead.stage_changed",
        payload: { requestId, fromStageId: lead.stageId, toStageId: stageId }
      });

      return updated;
    });
  }

  async addTag(organizationId: string, leadId: string, tagId: string) {
    await this.getOrThrow(organizationId, leadId);
    const tag = await this.prisma.client.tag.findUnique({ where: { id: tagId } });
    if (!tag || tag.organizationId !== organizationId) throw new NotFoundDomainError("Tag");
    await this.prisma.client.leadTag.upsert({
      where: { leadId_tagId: { leadId, tagId } },
      create: { leadId, tagId },
      update: {}
    });
  }

  async removeTag(organizationId: string, leadId: string, tagId: string) {
    await this.getOrThrow(organizationId, leadId);
    await this.prisma.client.leadTag.deleteMany({ where: { leadId, tagId } });
  }

  async listActivities(organizationId: string, leadId: string) {
    await this.getOrThrow(organizationId, leadId);
    return this.prisma.client.activity.findMany({ where: { leadId }, orderBy: { createdAt: "desc" } });
  }

  async addActivity(organizationId: string, leadId: string, actorUserId: string, content: string) {
    await this.getOrThrow(organizationId, leadId);
    return this.prisma.client.activity.create({
      data: { organizationId, leadId, type: "NOTE", content, actorUserId }
    });
  }
}

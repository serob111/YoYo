import { Injectable } from "@nestjs/common";
import type { CreateViewingInput, UpdateViewingInput, ViewingStatus } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class ViewingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, filters: { leadId?: string; propertyId?: string }) {
    const viewings = await this.prisma.client.viewing.findMany({
      where: {
        organizationId,
        ...(filters.leadId ? { leadId: filters.leadId } : {}),
        ...(filters.propertyId ? { propertyId: filters.propertyId } : {})
      },
      orderBy: { scheduledFor: "asc" },
      include: { property: { select: { title: true } }, lead: { select: { title: true } } }
    });

    return viewings.map(({ property, lead, ...viewing }) => ({
      ...viewing,
      propertyTitle: property.title,
      leadTitle: lead.title
    }));
  }

  async getOrThrow(organizationId: string, viewingId: string) {
    const viewing = await this.prisma.client.viewing.findUnique({ where: { id: viewingId } });
    if (!viewing || viewing.organizationId !== organizationId) throw new NotFoundDomainError("Viewing");
    return viewing;
  }

  async create(organizationId: string, input: CreateViewingInput) {
    const property = await this.prisma.client.property.findUnique({ where: { id: input.propertyId } });
    if (!property || property.organizationId !== organizationId) throw new NotFoundDomainError("Property");

    const lead = await this.prisma.client.lead.findUnique({ where: { id: input.leadId } });
    if (!lead || lead.organizationId !== organizationId) throw new NotFoundDomainError("Lead");

    return this.prisma.client.viewing.create({
      data: {
        organizationId,
        propertyId: input.propertyId,
        leadId: input.leadId,
        scheduledFor: new Date(input.scheduledFor),
        assignedUserId: input.assignedUserId ?? null,
        notes: input.notes ?? null
      }
    });
  }

  async update(organizationId: string, viewingId: string, input: UpdateViewingInput) {
    await this.getOrThrow(organizationId, viewingId);
    return this.prisma.client.viewing.update({
      where: { id: viewingId },
      data: {
        scheduledFor: new Date(input.scheduledFor),
        assignedUserId: input.assignedUserId ?? null,
        notes: input.notes ?? null
      }
    });
  }

  async updateStatus(organizationId: string, viewingId: string, status: ViewingStatus) {
    await this.getOrThrow(organizationId, viewingId);
    return this.prisma.client.viewing.update({ where: { id: viewingId }, data: { status } });
  }
}

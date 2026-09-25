import { Injectable } from "@nestjs/common";
import type { CreateOrganizationInput, UpdateOrganizationVerticalInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundDomainError } from "../common/domain-errors";
import { slugify, withUniqueSuffix } from "./slug.util";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async create(input: CreateOrganizationInput, ownerId: string) {
    const baseSlug = slugify(input.name);

    return this.prisma.client.$transaction(async (tx) => {
      let slug = baseSlug;
      // Optimistic collision handling: this is a low-frequency write path, so a
      // check-then-retry is acceptable rather than a more elaborate reservation scheme.
      const existing = await tx.organization.findUnique({ where: { slug } });
      if (existing) {
        slug = withUniqueSuffix(baseSlug);
      }

      const organization = await tx.organization.create({
        data: { name: input.name, slug, ...(input.vertical ? { vertical: input.vertical } : {}) }
      });
      const membership = await tx.organizationMember.create({
        data: { organizationId: organization.id, userId: ownerId, role: "OWNER", status: "ACTIVE", joinedAt: new Date() }
      });

      await this.audit.record(
        {
          organizationId: organization.id,
          actorId: ownerId,
          action: "organization.created",
          entityType: "Organization",
          entityId: organization.id,
          metadata: { name: organization.name }
        },
        tx
      );

      return { organization, membership };
    });
  }

  async listMine(userId: string) {
    const memberships = await this.prisma.client.organizationMember.findMany({
      where: { userId, status: "ACTIVE" },
      include: { organization: true },
      orderBy: { organization: { createdAt: "asc" } }
    });
    return memberships.map((m) => ({ ...m.organization, myRole: m.role }));
  }

  async getForMember(organizationId: string, role: string) {
    const organization = await this.prisma.client.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundDomainError("Organization");
    }
    return { ...organization, myRole: role };
  }

  async getDashboardStats(organizationId: string) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [newLeadsThisWeek, overdueFollowUps, wonLeads, closedLeads, aiHandledConversations, humanHandledConversations] = await Promise.all([
      this.prisma.client.lead.count({ where: { organizationId, createdAt: { gte: weekAgo } } }),
      this.prisma.client.followUp.count({ where: { organizationId, status: "PENDING", scheduledFor: { lt: new Date() } } }),
      this.prisma.client.lead.count({ where: { organizationId, closedAt: { not: null }, stage: { isWon: true } } }),
      this.prisma.client.lead.count({ where: { organizationId, closedAt: { not: null } } }),
      this.prisma.client.conversation.count({ where: { organizationId, automationState: "AI_ACTIVE" } }),
      this.prisma.client.conversation.count({ where: { organizationId, automationState: "HUMAN_ACTIVE" } })
    ]);

    return {
      newLeadsThisWeek,
      overdueFollowUps,
      conversionRate: closedLeads > 0 ? wonLeads / closedLeads : null,
      aiHandledConversations,
      humanHandledConversations
    };
  }

  // All five checklist items are derived from existing data - no persisted
  // "onboarding progress" field exists or is needed. firstMatchReviewed in
  // particular reuses LeadProperty (created by the existing linkLead
  // endpoint) as the signal that a human confirmed a property-lead match,
  // rather than inventing a new column for it.
  async getSetupStatus(organizationId: string) {
    const [propertyCount, connectedAccountCount, leadCount, leadPropertyCount] = await Promise.all([
      this.prisma.client.property.count({ where: { organizationId } }),
      this.prisma.client.connectedAccount.count({ where: { organizationId, status: "CONNECTED" } }),
      this.prisma.client.lead.count({ where: { organizationId } }),
      this.prisma.client.leadProperty.count({ where: { property: { organizationId } } })
    ]);

    const inventoryConfigured = propertyCount > 0;
    const socialConnected = connectedAccountCount > 0;
    const firstLeadProcessed = leadCount > 0;
    const firstMatchReviewed = leadPropertyCount > 0;

    return {
      agencyCreated: true,
      inventoryConfigured,
      socialConnected,
      firstLeadProcessed,
      firstMatchReviewed,
      complete: inventoryConfigured && socialConnected && firstLeadProcessed && firstMatchReviewed
    };
  }

  async updateVertical(organizationId: string, input: UpdateOrganizationVerticalInput, actorId: string) {
    const organization = await this.prisma.client.organization.update({
      where: { id: organizationId },
      data: { vertical: input.vertical }
    });

    await this.audit.record({
      organizationId,
      actorId,
      action: "organization.vertical_changed",
      entityType: "Organization",
      entityId: organizationId,
      metadata: { vertical: input.vertical }
    });

    return organization;
  }
}

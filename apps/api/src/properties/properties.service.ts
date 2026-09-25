import { Injectable } from "@nestjs/common";
import type { PropertyStatus, PropertyType } from "@yoyo/database";
import type { UpsertPropertyInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { OutboxService } from "../common/outbox.service";
import { RequestContext } from "../common/request-context";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  async list(
    organizationId: string,
    filters: { status?: PropertyStatus; propertyType?: PropertyType },
    cursor?: string,
    take = 30
  ) {
    const properties = await this.prisma.client.property.findMany({
      where: {
        organizationId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.propertyType ? { propertyType: filters.propertyType } : {})
      },
      orderBy: { updatedAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    const hasMore = properties.length > take;
    const page = hasMore ? properties.slice(0, take) : properties;
    return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async getOrThrow(organizationId: string, propertyId: string) {
    const property = await this.prisma.client.property.findUnique({
      where: { id: propertyId },
      include: { leads: { include: { lead: true } } }
    });
    if (!property || property.organizationId !== organizationId) throw new NotFoundDomainError("Property");
    return property;
  }

  async create(organizationId: string, input: UpsertPropertyInput) {
    const requestId = RequestContext.current()?.requestId ?? "api";

    return this.prisma.client.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          organizationId,
          title: input.title,
          description: input.description ?? null,
          propertyType: input.propertyType,
          status: input.status,
          visibility: input.visibility,
          transactionType: input.transactionType,
          priceCents: input.priceCents ?? null,
          currency: input.currency,
          rentBillingPeriod: input.rentBillingPeriod ?? null,
          depositCents: input.depositCents ?? null,
          minRentalPeriodDays: input.minRentalPeriodDays ?? null,
          availableFrom: input.availableFrom ?? null,
          country: input.country ?? null,
          district: input.district ?? null,
          city: input.city ?? null,
          address: input.address ?? null,
          bedrooms: input.bedrooms ?? null,
          bathrooms: input.bathrooms ?? null,
          areaSqm: input.areaSqm ?? null,
          floor: input.floor ?? null,
          totalFloors: input.totalFloors ?? null,
          condition: input.condition ?? null,
          buildingType: input.buildingType ?? null
        }
      });

      if (property.status === "ACTIVE") {
        await this.outbox.record(tx, {
          organizationId,
          aggregateType: "Property",
          aggregateId: property.id,
          eventType: "property.activated",
          payload: { requestId }
        });
      }

      return property;
    });
  }

  async update(organizationId: string, propertyId: string, input: UpsertPropertyInput) {
    const existing = await this.getOrThrow(organizationId, propertyId);
    const requestId = RequestContext.current()?.requestId ?? "api";

    return this.prisma.client.$transaction(async (tx) => {
      const property = await tx.property.update({
        where: { id: propertyId },
        data: {
          title: input.title,
          description: input.description ?? null,
          propertyType: input.propertyType,
          status: input.status,
          visibility: input.visibility,
          transactionType: input.transactionType,
          priceCents: input.priceCents ?? null,
          currency: input.currency,
          rentBillingPeriod: input.rentBillingPeriod ?? null,
          depositCents: input.depositCents ?? null,
          minRentalPeriodDays: input.minRentalPeriodDays ?? null,
          availableFrom: input.availableFrom ?? null,
          country: input.country ?? null,
          district: input.district ?? null,
          city: input.city ?? null,
          address: input.address ?? null,
          bedrooms: input.bedrooms ?? null,
          bathrooms: input.bathrooms ?? null,
          areaSqm: input.areaSqm ?? null,
          floor: input.floor ?? null,
          totalFloors: input.totalFloors ?? null,
          condition: input.condition ?? null,
          buildingType: input.buildingType ?? null
        }
      });

      // Only fires on the transition into ACTIVE, not every edit to an
      // already-active listing - otherwise every price tweak would re-notify
      // every matching lead.
      if (existing.status !== "ACTIVE" && property.status === "ACTIVE") {
        await this.outbox.record(tx, {
          organizationId,
          aggregateType: "Property",
          aggregateId: property.id,
          eventType: "property.activated",
          payload: { requestId }
        });
      }

      return property;
    });
  }

  async remove(organizationId: string, propertyId: string) {
    await this.getOrThrow(organizationId, propertyId);
    await this.prisma.client.property.delete({ where: { id: propertyId } });
  }

  async linkLead(organizationId: string, propertyId: string, leadId: string) {
    await this.getOrThrow(organizationId, propertyId);
    const lead = await this.prisma.client.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.organizationId !== organizationId) throw new NotFoundDomainError("Lead");

    await this.prisma.client.leadProperty.upsert({
      where: { leadId_propertyId: { leadId, propertyId } },
      create: { leadId, propertyId },
      update: {}
    });
  }

  async unlinkLead(organizationId: string, propertyId: string, leadId: string) {
    await this.getOrThrow(organizationId, propertyId);
    await this.prisma.client.leadProperty.deleteMany({ where: { leadId, propertyId } });
  }

  async getMedia(organizationId: string, propertyId: string) {
    await this.getOrThrow(organizationId, propertyId);
    return this.prisma.client.propertyMedia.findMany({ where: { organizationId, propertyId }, orderBy: { position: "asc" } });
  }

  // Denormalized propertyId on SocialMediaItem (set at import/link time) means
  // this never needs to join through PropertyImportCandidate.
  async getSocialSources(organizationId: string, propertyId: string) {
    await this.getOrThrow(organizationId, propertyId);
    return this.prisma.client.socialMediaItem.findMany({
      where: { organizationId, propertyId },
      orderBy: { postedAt: "desc" },
      select: { id: true, provider: true, mediaType: true, caption: true, permalink: true, postedAt: true, thumbnailUrl: true }
    });
  }
}

import { Injectable } from "@nestjs/common";
import { generateViewingSlots, getOrCreateDefaultPipeline } from "@yoyo/database";
import type { BookViewingInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError, ConflictDomainError } from "../common/domain-errors";

// A viewing occupies a full slot even if the org later changes its slot
// length - fixed here rather than configurable, matching the "don't
// over-engineer" call on the rest of this module.
const SLOT_MINUTES = 60;
const DEFAULT_TIMEZONE = "UTC";

const STOREFRONT_PROPERTY_SELECT = {
  id: true,
  title: true,
  description: true,
  propertyType: true,
  transactionType: true,
  priceCents: true,
  currency: true,
  rentBillingPeriod: true,
  depositCents: true,
  minRentalPeriodDays: true,
  availableFrom: true,
  country: true,
  district: true,
  city: true,
  bedrooms: true,
  bathrooms: true,
  areaSqm: true,
  floor: true,
  totalFloors: true,
  condition: true,
  buildingType: true
} as const;

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  // Deliberately unauthenticated (see StorefrontController) - only ever
  // returns ACTIVE + ORGANIZATION_STOREFRONT properties, never PRIVATE/DRAFT
  // ones or anything beyond the public-safe field subset.
  async getStorefront(orgSlug: string) {
    const organization = await this.prisma.client.organization.findUnique({
      where: { slug: orgSlug },
      include: { businessProfile: { select: { description: true } } }
    });
    if (!organization) throw new NotFoundDomainError("Storefront");

    const properties = await this.prisma.client.property.findMany({
      where: { organizationId: organization.id, status: "ACTIVE", visibility: { in: ["ORGANIZATION_STOREFRONT", "MARKETPLACE"] } },
      orderBy: { createdAt: "desc" },
      select: STOREFRONT_PROPERTY_SELECT
    });

    return {
      organization: { name: organization.name, slug: organization.slug, description: organization.businessProfile?.description ?? null },
      properties
    };
  }

  private async getStorefrontPropertyOrThrow(orgSlug: string, propertyId: string) {
    const organization = await this.prisma.client.organization.findUnique({ where: { slug: orgSlug } });
    if (!organization) throw new NotFoundDomainError("Storefront");

    const property = await this.prisma.client.property.findUnique({ where: { id: propertyId }, select: { ...STOREFRONT_PROPERTY_SELECT, organizationId: true, status: true, visibility: true } });
    const isPublic = property?.visibility === "ORGANIZATION_STOREFRONT" || property?.visibility === "MARKETPLACE";
    if (!property || property.organizationId !== organization.id || property.status !== "ACTIVE" || !isPublic) {
      throw new NotFoundDomainError("Property");
    }
    return { organization, property };
  }

  async getProperty(orgSlug: string, propertyId: string) {
    const { property } = await this.getStorefrontPropertyOrThrow(orgSlug, propertyId);
    const {
      id,
      title,
      description,
      propertyType,
      transactionType,
      priceCents,
      currency,
      rentBillingPeriod,
      depositCents,
      minRentalPeriodDays,
      availableFrom,
      country,
      district,
      city,
      bedrooms,
      bathrooms,
      areaSqm,
      floor,
      totalFloors,
      condition,
      buildingType
    } = property;
    return {
      id,
      title,
      description,
      propertyType,
      transactionType,
      priceCents,
      currency,
      rentBillingPeriod,
      depositCents,
      minRentalPeriodDays,
      availableFrom,
      country,
      district,
      city,
      bedrooms,
      bathrooms,
      areaSqm,
      floor,
      totalFloors,
      condition,
      buildingType
    };
  }

  async getAvailability(orgSlug: string, propertyId: string, date: string) {
    const { organization, property } = await this.getStorefrontPropertyOrThrow(orgSlug, propertyId);
    const businessProfile = await this.prisma.client.businessProfile.findUnique({
      where: { organizationId: organization.id },
      select: { timezone: true, businessHours: true }
    });

    const dayStart = new Date(`${date}T00:00:00Z`);
    const dayEnd = new Date(`${date}T23:59:59Z`);
    const booked = await this.prisma.client.viewing.findMany({
      where: { propertyId: property.id, status: "SCHEDULED", scheduledFor: { gte: dayStart, lte: dayEnd } },
      select: { scheduledFor: true }
    });

    const slots = generateViewingSlots({
      date,
      timezone: businessProfile?.timezone ?? DEFAULT_TIMEZONE,
      businessHours: businessProfile?.businessHours ?? null,
      slotMinutes: SLOT_MINUTES,
      now: new Date(),
      bookedTimes: booked.map((v) => v.scheduledFor)
    });

    return { date, slots: slots.map((s) => s.toISOString()) };
  }

  async bookViewing(orgSlug: string, propertyId: string, input: BookViewingInput) {
    const { organization, property } = await this.getStorefrontPropertyOrThrow(orgSlug, propertyId);
    const businessProfile = await this.prisma.client.businessProfile.findUnique({
      where: { organizationId: organization.id },
      select: { timezone: true, businessHours: true }
    });

    const scheduledFor = new Date(input.scheduledFor);
    const date = scheduledFor.toISOString().slice(0, 10);
    const booked = await this.prisma.client.viewing.findMany({
      where: { propertyId: property.id, status: "SCHEDULED", scheduledFor: { gte: new Date(`${date}T00:00:00Z`), lte: new Date(`${date}T23:59:59Z`) } },
      select: { scheduledFor: true }
    });
    const availableSlots = generateViewingSlots({
      date,
      timezone: businessProfile?.timezone ?? DEFAULT_TIMEZONE,
      businessHours: businessProfile?.businessHours ?? null,
      slotMinutes: SLOT_MINUTES,
      now: new Date(),
      bookedTimes: booked.map((v) => v.scheduledFor)
    });
    const isAvailable = availableSlots.some((s) => s.getTime() === scheduledFor.getTime());
    if (!isAvailable) throw new ConflictDomainError("That time is no longer available. Please pick another slot.");

    return this.prisma.client.$transaction(async (tx) => {
      let contact = await tx.contact.findFirst({ where: { organizationId: organization.id, phone: input.phone } });
      if (!contact) {
        contact = await tx.contact.create({
          data: { organizationId: organization.id, displayName: input.name, phone: input.phone, email: input.email ?? null }
        });
      } else if (contact.displayName !== input.name || contact.email !== (input.email ?? null)) {
        contact = await tx.contact.update({
          where: { id: contact.id },
          data: { displayName: input.name, email: input.email ?? contact.email }
        });
      }

      const pipeline = await getOrCreateDefaultPipeline(tx, organization.id);
      const firstStage = pipeline.stages[0];
      if (!firstStage) throw new Error("Default pipeline was created with no stages - this should never happen");

      const lead = await tx.lead.create({
        data: {
          organizationId: organization.id,
          contactId: contact.id,
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          title: `Viewing request: ${property.title}`
        }
      });

      await tx.leadProperty.create({ data: { leadId: lead.id, propertyId: property.id } });

      const viewing = await tx.viewing.create({
        data: {
          organizationId: organization.id,
          propertyId: property.id,
          leadId: lead.id,
          scheduledFor,
          notes: input.notes ?? null
        }
      });

      return { viewingId: viewing.id, scheduledFor: viewing.scheduledFor.toISOString(), propertyTitle: property.title, organizationName: organization.name };
    });
  }
}

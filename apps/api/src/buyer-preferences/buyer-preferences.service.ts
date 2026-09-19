import { Injectable } from "@nestjs/common";
import type { TransactionType } from "@yoyo/database";
import type { UpsertBuyerPreferenceInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class BuyerPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getContactOrThrow(organizationId: string, contactId: string) {
    const contact = await this.prisma.client.contact.findUnique({ where: { id: contactId } });
    if (!contact || contact.organizationId !== organizationId) throw new NotFoundDomainError("Contact");
    return contact;
  }

  async getOrThrow(organizationId: string, contactId: string, transactionType: TransactionType) {
    await this.getContactOrThrow(organizationId, contactId);
    const preference = await this.prisma.client.buyerPreference.findUnique({
      where: { contactId_transactionType: { contactId, transactionType } }
    });
    if (!preference) throw new NotFoundDomainError("Buyer preference");
    return preference;
  }

  async upsert(organizationId: string, contactId: string, input: UpsertBuyerPreferenceInput) {
    await this.getContactOrThrow(organizationId, contactId);

    return this.prisma.client.buyerPreference.upsert({
      where: { contactId_transactionType: { contactId, transactionType: input.transactionType } },
      create: {
        organizationId,
        contactId,
        transactionType: input.transactionType,
        minPriceCents: input.minPriceCents ?? null,
        maxPriceCents: input.maxPriceCents ?? null,
        currency: input.currency,
        minAreaSqm: input.minAreaSqm ?? null,
        bedrooms: input.bedrooms ?? null,
        country: input.country ?? null,
        city: input.city ?? null,
        districts: input.districts,
        propertyType: input.propertyType ?? null,
        furnished: input.furnished ?? null,
        moveInDate: input.moveInDate ?? null,
        leaseDurationMonths: input.leaseDurationMonths ?? null,
        hasPets: input.hasPets ?? null,
        occupantCount: input.occupantCount ?? null,
        financingType: input.financingType ?? null,
        purchaseTimeframe: input.purchaseTimeframe ?? null,
        notes: input.notes ?? null
      },
      update: {
        minPriceCents: input.minPriceCents ?? null,
        maxPriceCents: input.maxPriceCents ?? null,
        currency: input.currency,
        minAreaSqm: input.minAreaSqm ?? null,
        bedrooms: input.bedrooms ?? null,
        country: input.country ?? null,
        city: input.city ?? null,
        districts: input.districts,
        propertyType: input.propertyType ?? null,
        furnished: input.furnished ?? null,
        moveInDate: input.moveInDate ?? null,
        leaseDurationMonths: input.leaseDurationMonths ?? null,
        hasPets: input.hasPets ?? null,
        occupantCount: input.occupantCount ?? null,
        financingType: input.financingType ?? null,
        purchaseTimeframe: input.purchaseTimeframe ?? null,
        notes: input.notes ?? null
      }
    });
  }
}

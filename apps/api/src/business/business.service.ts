import { Injectable } from "@nestjs/common";
import type { Prisma } from "@yoyo/database";
import type { UpsertBusinessProfileInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrThrow(organizationId: string) {
    const profile = await this.prisma.client.businessProfile.findUnique({ where: { organizationId } });
    if (!profile) throw new NotFoundDomainError("Business profile");
    return profile;
  }

  async upsert(organizationId: string, input: UpsertBusinessProfileInput) {
    return this.prisma.client.businessProfile.upsert({
      where: { organizationId },
      create: {
        organizationId,
        businessName: input.businessName,
        description: input.description ?? null,
        tone: input.tone ?? null,
        timezone: input.timezone,
        businessHours: (input.businessHours ?? undefined) as Prisma.InputJsonValue | undefined,
        aiEnabled: input.aiEnabled,
        defaultModel: input.defaultModel ?? null,
        monthlyCostCapCents: input.monthlyCostCapCents ?? null
      },
      update: {
        businessName: input.businessName,
        description: input.description ?? null,
        tone: input.tone ?? null,
        timezone: input.timezone,
        businessHours: (input.businessHours ?? undefined) as Prisma.InputJsonValue | undefined,
        aiEnabled: input.aiEnabled,
        defaultModel: input.defaultModel ?? null,
        monthlyCostCapCents: input.monthlyCostCapCents ?? null
      }
    });
  }
}

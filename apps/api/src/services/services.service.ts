import { Injectable } from "@nestjs/common";
import type { UpsertServiceInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.client.service.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }

  async getOrThrow(organizationId: string, serviceId: string) {
    const service = await this.prisma.client.service.findUnique({ where: { id: serviceId } });
    if (!service || service.organizationId !== organizationId) throw new NotFoundDomainError("Service");
    return service;
  }

  async create(organizationId: string, input: UpsertServiceInput) {
    return this.prisma.client.service.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents ?? null,
        currency: input.currency,
        durationMinutes: input.durationMinutes ?? null,
        active: input.active
      }
    });
  }

  async update(organizationId: string, serviceId: string, input: UpsertServiceInput) {
    await this.getOrThrow(organizationId, serviceId);
    return this.prisma.client.service.update({
      where: { id: serviceId },
      data: {
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents ?? null,
        currency: input.currency,
        durationMinutes: input.durationMinutes ?? null,
        active: input.active
      }
    });
  }

  async remove(organizationId: string, serviceId: string) {
    await this.getOrThrow(organizationId, serviceId);
    await this.prisma.client.service.delete({ where: { id: serviceId } });
  }
}

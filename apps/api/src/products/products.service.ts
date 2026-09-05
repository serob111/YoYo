import { Injectable } from "@nestjs/common";
import type { UpsertProductInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.client.product.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }

  async getOrThrow(organizationId: string, productId: string) {
    const product = await this.prisma.client.product.findUnique({ where: { id: productId } });
    if (!product || product.organizationId !== organizationId) throw new NotFoundDomainError("Product");
    return product;
  }

  async create(organizationId: string, input: UpsertProductInput) {
    return this.prisma.client.product.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents ?? null,
        currency: input.currency,
        active: input.active
      }
    });
  }

  async update(organizationId: string, productId: string, input: UpsertProductInput) {
    await this.getOrThrow(organizationId, productId);
    return this.prisma.client.product.update({
      where: { id: productId },
      data: {
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents ?? null,
        currency: input.currency,
        active: input.active
      }
    });
  }

  async remove(organizationId: string, productId: string) {
    await this.getOrThrow(organizationId, productId);
    await this.prisma.client.product.delete({ where: { id: productId } });
  }
}

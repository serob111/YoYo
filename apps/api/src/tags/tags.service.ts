import { Injectable } from "@nestjs/common";
import type { CreateTagInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.client.tag.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }

  async create(organizationId: string, input: CreateTagInput) {
    return this.prisma.client.tag.create({
      data: { organizationId, name: input.name, color: input.color ?? null }
    });
  }

  async remove(organizationId: string, tagId: string) {
    const tag = await this.prisma.client.tag.findUnique({ where: { id: tagId } });
    if (!tag || tag.organizationId !== organizationId) throw new NotFoundDomainError("Tag");
    await this.prisma.client.tag.delete({ where: { id: tagId } });
  }
}

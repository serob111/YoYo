import { Injectable } from "@nestjs/common";
import type { CreateOrganizationInput } from "@yoyo/contracts";
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

      const organization = await tx.organization.create({ data: { name: input.name, slug } });
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
}

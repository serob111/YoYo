import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { OrganizationRole } from "@yoyo/database";
import { PrismaService } from "./prisma.service";
import { RequestContext } from "./request-context";
import { TenantAccessDeniedError } from "./domain-errors";

declare module "express-serve-static-core" {
  interface Request {
    membership?: { organizationId: string; role: OrganizationRole; memberId: string };
  }
}

/**
 * Resolves organizationId from the route param and validates the caller has an ACTIVE
 * membership in it, BEFORE any handler runs. This is the one place organizationId is
 * trusted from client input — every downstream repository call uses the value attached
 * here, never the raw route param again. See docs/architecture/tenant-model.md.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const organizationId = request.params.organizationId;
    if (!organizationId || !request.currentUser) {
      throw new TenantAccessDeniedError();
    }

    const membership = await this.prisma.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: request.currentUser.id } }
    });

    if (!membership || membership.status !== "ACTIVE") {
      // Same response whether the org doesn't exist, the membership doesn't exist, or
      // it's REMOVED — never leaks which case it is to an unauthorized caller.
      throw new TenantAccessDeniedError();
    }

    request.membership = { organizationId, role: membership.role, memberId: membership.id };
    RequestContext.setOrganizationId(organizationId);
    return true;
  }
}

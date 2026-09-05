import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { AuditService } from "./audit.service";

@Controller("organizations/:organizationId/audit-log")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequireCapability("manageMembers")
  async list(@Param("organizationId") organizationId: string, @Query("cursor") cursor?: string) {
    return this.audit.listForOrganization(organizationId, cursor);
  }
}

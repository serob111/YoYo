import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { createOrganizationSchema, updateOrganizationVerticalSchema, type CreateOrganizationInput, type UpdateOrganizationVerticalInput } from "@yoyo/contracts";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CsrfGuard } from "../common/csrf.guard";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
@UseGuards(SessionGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @UseGuards(CsrfGuard)
  async create(@Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput, @CurrentUser() user: CurrentUserPayload) {
    const { organization } = await this.organizations.create(body, user.id);
    return { ...organization, myRole: "OWNER" as const };
  }

  @Get()
  async listMine(@CurrentUser() user: CurrentUserPayload) {
    return this.organizations.listMine(user.id);
  }

  @Get(":organizationId")
  @UseGuards(TenantContextGuard)
  async getOne(@Param("organizationId") organizationId: string, @Req() req: Request) {
    return this.organizations.getForMember(organizationId, req.membership!.role);
  }

  @Get(":organizationId/dashboard-stats")
  @UseGuards(TenantContextGuard)
  async getDashboardStats(@Param("organizationId") organizationId: string) {
    return this.organizations.getDashboardStats(organizationId);
  }

  @Get(":organizationId/setup-status")
  @UseGuards(TenantContextGuard)
  async getSetupStatus(@Param("organizationId") organizationId: string) {
    return this.organizations.getSetupStatus(organizationId);
  }

  @Patch(":organizationId/vertical")
  @UseGuards(TenantContextGuard, CapabilityGuard, CsrfGuard)
  @RequireCapability("manageBilling")
  async updateVertical(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(updateOrganizationVerticalSchema)) body: UpdateOrganizationVerticalInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.organizations.updateVertical(organizationId, body, user.id);
  }
}

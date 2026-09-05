import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { createOrganizationSchema, type CreateOrganizationInput } from "@yoyo/contracts";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
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
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { createFollowUpSchema, type CreateFollowUpInput } from "@yoyo/contracts";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FollowUpsService } from "./follow-ups.service";

@Controller("organizations/:organizationId/follow-ups")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string, @Query("leadId") leadId?: string) {
    return this.followUps.list(organizationId, leadId);
  }

  @Post()
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async create(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(createFollowUpSchema)) body: CreateFollowUpInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.followUps.create(organizationId, user.id, body);
  }

  @Patch(":followUpId/cancel")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async cancel(@Param("organizationId") organizationId: string, @Param("followUpId") followUpId: string) {
    return this.followUps.cancel(organizationId, followUpId);
  }
}

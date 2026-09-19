import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  createViewingSchema,
  updateViewingSchema,
  updateViewingStatusSchema,
  type CreateViewingInput,
  type UpdateViewingInput,
  type UpdateViewingStatusInput
} from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ViewingsService } from "./viewings.service";

@Controller("organizations/:organizationId/viewings")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class ViewingsController {
  constructor(private readonly viewings: ViewingsService) {}

  @Get()
  async list(
    @Param("organizationId") organizationId: string,
    @Query("leadId") leadId?: string,
    @Query("propertyId") propertyId?: string
  ) {
    return this.viewings.list(organizationId, { leadId, propertyId });
  }

  @Get(":viewingId")
  async get(@Param("organizationId") organizationId: string, @Param("viewingId") viewingId: string) {
    return this.viewings.getOrThrow(organizationId, viewingId);
  }

  @Post()
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async create(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(createViewingSchema)) body: CreateViewingInput
  ) {
    return this.viewings.create(organizationId, body);
  }

  @Patch(":viewingId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async update(
    @Param("organizationId") organizationId: string,
    @Param("viewingId") viewingId: string,
    @Body(new ZodValidationPipe(updateViewingSchema)) body: UpdateViewingInput
  ) {
    return this.viewings.update(organizationId, viewingId, body);
  }

  @Patch(":viewingId/status")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async updateStatus(
    @Param("organizationId") organizationId: string,
    @Param("viewingId") viewingId: string,
    @Body(new ZodValidationPipe(updateViewingStatusSchema)) body: UpdateViewingStatusInput
  ) {
    return this.viewings.updateStatus(organizationId, viewingId, body.status);
  }
}

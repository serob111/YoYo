import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  addLeadTagSchema,
  createActivitySchema,
  moveLeadStageSchema,
  updateLeadSchema,
  upsertLeadSchema,
  type AddLeadTagInput,
  type CreateActivityInput,
  type MoveLeadStageInput,
  type UpdateLeadInput,
  type UpsertLeadInput
} from "@yoyo/contracts";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LeadsService } from "./leads.service";

@Controller("organizations/:organizationId/leads")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  async list(
    @Param("organizationId") organizationId: string,
    @Query("cursor") cursor?: string,
    @Query("stageId") stageId?: string,
    @Query("contactId") contactId?: string,
    @Query("search") search?: string,
    @Query("intent") intent?: string
  ) {
    return this.leads.list(organizationId, { stageId, contactId, search, intent }, cursor);
  }

  @Get(":leadId")
  async get(@Param("organizationId") organizationId: string, @Param("leadId") leadId: string) {
    return this.leads.getOrThrow(organizationId, leadId);
  }

  @Post()
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async create(@Param("organizationId") organizationId: string, @Body(new ZodValidationPipe(upsertLeadSchema)) body: UpsertLeadInput) {
    return this.leads.create(organizationId, body);
  }

  @Patch(":leadId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async update(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body(new ZodValidationPipe(updateLeadSchema)) body: UpdateLeadInput
  ) {
    return this.leads.update(organizationId, leadId, body);
  }

  @Patch(":leadId/stage")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async moveStage(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body(new ZodValidationPipe(moveLeadStageSchema)) body: MoveLeadStageInput
  ) {
    return this.leads.moveStage(organizationId, leadId, body.stageId);
  }

  @Post(":leadId/tags")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async addTag(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body(new ZodValidationPipe(addLeadTagSchema)) body: AddLeadTagInput
  ) {
    await this.leads.addTag(organizationId, leadId, body.tagId);
    return { success: true };
  }

  @Delete(":leadId/tags/:tagId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async removeTag(@Param("organizationId") organizationId: string, @Param("leadId") leadId: string, @Param("tagId") tagId: string) {
    await this.leads.removeTag(organizationId, leadId, tagId);
    return { success: true };
  }

  @Get(":leadId/activities")
  async listActivities(@Param("organizationId") organizationId: string, @Param("leadId") leadId: string) {
    return this.leads.listActivities(organizationId, leadId);
  }

  @Post(":leadId/activities")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async addActivity(
    @Param("organizationId") organizationId: string,
    @Param("leadId") leadId: string,
    @Body(new ZodValidationPipe(createActivitySchema)) body: CreateActivityInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.leads.addActivity(organizationId, leadId, user.id, body.content);
  }
}

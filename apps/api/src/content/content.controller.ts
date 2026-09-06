import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  addContentMediaAssetSchema,
  createContentItemSchema,
  enhanceImageSchema,
  generateCaptionSchema,
  rejectContentItemSchema,
  scheduleContentItemSchema,
  updateContentItemSchema,
  type AddContentMediaAssetInput,
  type CreateContentItemInput,
  type EnhanceImageInput,
  type GenerateCaptionInput,
  type RejectContentItemInput,
  type ScheduleContentItemInput,
  type UpdateContentItemInput
} from "@yoyo/contracts";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ContentService } from "./content.service";

@Controller("organizations/:organizationId/content")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string, @Query("status") status?: string, @Query("connectedAccountId") connectedAccountId?: string) {
    return this.content.list(organizationId, { status, connectedAccountId });
  }

  @Get(":id")
  async get(@Param("organizationId") organizationId: string, @Param("id") id: string) {
    return this.content.getOrThrow(organizationId, id);
  }

  @Post()
  @RequireCapability("manageContent")
  @UseGuards(CsrfGuard)
  async create(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(createContentItemSchema)) body: CreateContentItemInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.content.create(organizationId, user.id, body);
  }

  @Patch(":id")
  @RequireCapability("manageContent")
  @UseGuards(CsrfGuard)
  async update(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContentItemSchema)) body: UpdateContentItemInput
  ) {
    return this.content.update(organizationId, id, body);
  }

  @Delete(":id")
  @RequireCapability("manageContent")
  @UseGuards(CsrfGuard)
  async remove(@Param("organizationId") organizationId: string, @Param("id") id: string) {
    await this.content.remove(organizationId, id);
    return { success: true };
  }

  @Post(":id/media")
  @RequireCapability("manageContent")
  @UseGuards(CsrfGuard)
  async addMedia(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addContentMediaAssetSchema)) body: AddContentMediaAssetInput
  ) {
    return this.content.addMediaAsset(organizationId, id, body);
  }

  @Delete(":id/media/:mediaAssetId")
  @RequireCapability("manageContent")
  @UseGuards(CsrfGuard)
  async removeMedia(@Param("organizationId") organizationId: string, @Param("id") id: string, @Param("mediaAssetId") mediaAssetId: string) {
    await this.content.removeMediaAsset(organizationId, id, mediaAssetId);
    return { success: true };
  }

  @Post(":id/generate-caption")
  @RequireCapability("manageContent")
  @UseGuards(CsrfGuard)
  async generateCaption(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(generateCaptionSchema)) body: GenerateCaptionInput
  ) {
    return this.content.requestCaptionGeneration(organizationId, id, body);
  }

  @Post(":id/media/:mediaAssetId/enhance")
  @RequireCapability("manageContent")
  @UseGuards(CsrfGuard)
  async enhanceImage(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Param("mediaAssetId") mediaAssetId: string,
    @Body(new ZodValidationPipe(enhanceImageSchema)) body: EnhanceImageInput
  ) {
    return this.content.requestImageEnhancement(organizationId, id, mediaAssetId, body);
  }

  @Post(":id/submit")
  @RequireCapability("manageContent")
  @UseGuards(CsrfGuard)
  async submit(@Param("organizationId") organizationId: string, @Param("id") id: string) {
    return this.content.submit(organizationId, id);
  }

  @Post(":id/approve")
  @RequireCapability("publishContent")
  @UseGuards(CsrfGuard)
  async approve(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(scheduleContentItemSchema.partial())) body: Partial<ScheduleContentItemInput>,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.content.approve(organizationId, id, user.id, body.scheduledFor ?? undefined);
  }

  @Post(":id/reject")
  @RequireCapability("publishContent")
  @UseGuards(CsrfGuard)
  async reject(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectContentItemSchema)) body: RejectContentItemInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.content.reject(organizationId, id, user.id, body);
  }

  @Post(":id/cancel")
  @RequireCapability("publishContent")
  @UseGuards(CsrfGuard)
  async cancel(@Param("organizationId") organizationId: string, @Param("id") id: string) {
    return this.content.cancel(organizationId, id);
  }

  @Patch(":id/schedule")
  @RequireCapability("publishContent")
  @UseGuards(CsrfGuard)
  async schedule(
    @Param("organizationId") organizationId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(scheduleContentItemSchema)) body: ScheduleContentItemInput
  ) {
    return this.content.reschedule(organizationId, id, body);
  }
}

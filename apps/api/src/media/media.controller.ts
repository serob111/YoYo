import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { presignedUploadRequestSchema, type PresignedUploadRequestInput } from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MediaService } from "./media.service";

@Controller("organizations/:organizationId/media")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("presigned-upload")
  @RequireCapability("manageContent")
  @UseGuards(CsrfGuard)
  async presignedUpload(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(presignedUploadRequestSchema)) body: PresignedUploadRequestInput
  ) {
    return this.media.getPresignedUploadUrl(organizationId, body.contentType, body.kind);
  }

  @Get("presigned-download")
  @RequireCapability("manageContent")
  async presignedDownload(@Param("organizationId") organizationId: string, @Query("key") key: string) {
    const url = await this.media.getPresignedDownloadUrl(organizationId, key);
    return { url };
  }
}

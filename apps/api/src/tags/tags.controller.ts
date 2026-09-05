import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { createTagSchema, type CreateTagInput } from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TagsService } from "./tags.service";

@Controller("organizations/:organizationId/tags")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string) {
    return this.tags.list(organizationId);
  }

  @Post()
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async create(@Param("organizationId") organizationId: string, @Body(new ZodValidationPipe(createTagSchema)) body: CreateTagInput) {
    return this.tags.create(organizationId, body);
  }

  @Delete(":tagId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async remove(@Param("organizationId") organizationId: string, @Param("tagId") tagId: string) {
    await this.tags.remove(organizationId, tagId);
    return { success: true };
  }
}

import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { createKnowledgeChunkSchema, type CreateKnowledgeChunkInput } from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { KnowledgeService } from "./knowledge.service";

@Controller("organizations/:organizationId/knowledge")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string, @Query("cursor") cursor?: string) {
    return this.knowledge.list(organizationId, cursor);
  }

  @Post()
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async create(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(createKnowledgeChunkSchema)) body: CreateKnowledgeChunkInput
  ) {
    return this.knowledge.create(organizationId, body);
  }

  @Delete(":chunkId")
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async remove(@Param("organizationId") organizationId: string, @Param("chunkId") chunkId: string) {
    await this.knowledge.remove(organizationId, chunkId);
    return { success: true };
  }
}

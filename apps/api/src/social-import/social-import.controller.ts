import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  importPropertyImportCandidateSchema,
  linkPropertyImportCandidateSchema,
  startSocialSyncSchema,
  updatePropertyImportCandidateSchema,
  type ImportPropertyImportCandidateInput,
  type LinkPropertyImportCandidateInput,
  type StartSocialSyncInput,
  type UpdatePropertyImportCandidateInput
} from "@yoyo/contracts";
import type { PropertyImportCandidateStatus } from "@yoyo/database";
import { SessionGuard } from "../auth/session.guard";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SocialImportService } from "./social-import.service";

@Controller("organizations/:organizationId")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class SocialImportController {
  constructor(private readonly socialImport: SocialImportService) {}

  @Post("social-syncs")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async startSync(@Param("organizationId") organizationId: string, @Body(new ZodValidationPipe(startSocialSyncSchema)) body: StartSocialSyncInput) {
    return this.socialImport.startSync(organizationId, body.connectedAccountId);
  }

  @Get("social-syncs/latest")
  async getLatestSync(@Param("organizationId") organizationId: string, @Query("connectedAccountId") connectedAccountId: string) {
    return this.socialImport.getLatestSync(organizationId, connectedAccountId);
  }

  @Get("social-syncs/:syncId")
  async getSync(@Param("organizationId") organizationId: string, @Param("syncId") syncId: string) {
    return this.socialImport.getSync(organizationId, syncId);
  }

  @Get("property-import-candidates")
  async listCandidates(
    @Param("organizationId") organizationId: string,
    @Query("status") status?: PropertyImportCandidateStatus,
    @Query("connectedAccountId") connectedAccountId?: string
  ) {
    return this.socialImport.listCandidates(organizationId, { status, connectedAccountId });
  }

  @Get("property-import-candidates/:candidateId")
  async getCandidate(@Param("organizationId") organizationId: string, @Param("candidateId") candidateId: string) {
    return this.socialImport.getCandidate(organizationId, candidateId);
  }

  @Patch("property-import-candidates/:candidateId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async updateCandidate(
    @Param("organizationId") organizationId: string,
    @Param("candidateId") candidateId: string,
    @Body(new ZodValidationPipe(updatePropertyImportCandidateSchema)) body: UpdatePropertyImportCandidateInput
  ) {
    return this.socialImport.updateCandidate(organizationId, candidateId, body);
  }

  @Post("property-import-candidates/:candidateId/import")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async importCandidate(
    @Param("organizationId") organizationId: string,
    @Param("candidateId") candidateId: string,
    @Body(new ZodValidationPipe(importPropertyImportCandidateSchema)) body: ImportPropertyImportCandidateInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.socialImport.importCandidate(organizationId, candidateId, user.id, body);
  }

  @Post("property-import-candidates/:candidateId/link")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async linkCandidate(
    @Param("organizationId") organizationId: string,
    @Param("candidateId") candidateId: string,
    @Body(new ZodValidationPipe(linkPropertyImportCandidateSchema)) body: LinkPropertyImportCandidateInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.socialImport.linkCandidate(organizationId, candidateId, user.id, body);
  }

  @Post("property-import-candidates/:candidateId/ignore")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async ignoreCandidate(@Param("organizationId") organizationId: string, @Param("candidateId") candidateId: string, @CurrentUser() user: CurrentUserPayload) {
    await this.socialImport.ignoreCandidate(organizationId, candidateId, user.id);
    return { success: true };
  }
}

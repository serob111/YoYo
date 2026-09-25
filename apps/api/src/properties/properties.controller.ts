import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  addLeadPropertySchema,
  upsertPropertySchema,
  type AddLeadPropertyInput,
  type UpsertPropertyInput
} from "@yoyo/contracts";
import type { PropertyStatus, PropertyType } from "@yoyo/database";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PropertiesService } from "./properties.service";

@Controller("organizations/:organizationId/properties")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  async list(
    @Param("organizationId") organizationId: string,
    @Query("cursor") cursor?: string,
    @Query("status") status?: PropertyStatus,
    @Query("propertyType") propertyType?: PropertyType
  ) {
    return this.properties.list(organizationId, { status, propertyType }, cursor);
  }

  @Get(":propertyId")
  async get(@Param("organizationId") organizationId: string, @Param("propertyId") propertyId: string) {
    return this.properties.getOrThrow(organizationId, propertyId);
  }

  @Get(":propertyId/media")
  async getMedia(@Param("organizationId") organizationId: string, @Param("propertyId") propertyId: string) {
    return this.properties.getMedia(organizationId, propertyId);
  }

  @Get(":propertyId/social-sources")
  async getSocialSources(@Param("organizationId") organizationId: string, @Param("propertyId") propertyId: string) {
    return this.properties.getSocialSources(organizationId, propertyId);
  }

  @Post()
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async create(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(upsertPropertySchema)) body: UpsertPropertyInput
  ) {
    return this.properties.create(organizationId, body);
  }

  @Patch(":propertyId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async update(
    @Param("organizationId") organizationId: string,
    @Param("propertyId") propertyId: string,
    @Body(new ZodValidationPipe(upsertPropertySchema)) body: UpsertPropertyInput
  ) {
    return this.properties.update(organizationId, propertyId, body);
  }

  @Delete(":propertyId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async remove(@Param("organizationId") organizationId: string, @Param("propertyId") propertyId: string) {
    await this.properties.remove(organizationId, propertyId);
    return { success: true };
  }

  @Post(":propertyId/leads")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async linkLead(
    @Param("organizationId") organizationId: string,
    @Param("propertyId") propertyId: string,
    @Body(new ZodValidationPipe(addLeadPropertySchema)) body: AddLeadPropertyInput
  ) {
    await this.properties.linkLead(organizationId, propertyId, body.leadId);
    return { success: true };
  }

  @Delete(":propertyId/leads/:leadId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async unlinkLead(
    @Param("organizationId") organizationId: string,
    @Param("propertyId") propertyId: string,
    @Param("leadId") leadId: string
  ) {
    await this.properties.unlinkLead(organizationId, propertyId, leadId);
    return { success: true };
  }
}

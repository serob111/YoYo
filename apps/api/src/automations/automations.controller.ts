import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  createAutomationSchema,
  updateAutomationSchema,
  type CreateAutomationInput,
  type UpdateAutomationInput
} from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AutomationsService } from "./automations.service";

@Controller("organizations/:organizationId/automations")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  @RequireCapability("manageAutomations")
  async list(@Param("organizationId") organizationId: string) {
    return this.automations.list(organizationId);
  }

  @Get(":automationId")
  @RequireCapability("manageAutomations")
  async get(@Param("organizationId") organizationId: string, @Param("automationId") automationId: string) {
    return this.automations.getOrThrow(organizationId, automationId);
  }

  @Post()
  @RequireCapability("manageAutomations")
  @UseGuards(CsrfGuard)
  async create(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(createAutomationSchema)) body: CreateAutomationInput
  ) {
    return this.automations.create(organizationId, body);
  }

  @Patch(":automationId")
  @RequireCapability("manageAutomations")
  @UseGuards(CsrfGuard)
  async update(
    @Param("organizationId") organizationId: string,
    @Param("automationId") automationId: string,
    @Body(new ZodValidationPipe(updateAutomationSchema)) body: UpdateAutomationInput
  ) {
    return this.automations.update(organizationId, automationId, body);
  }

  @Delete(":automationId")
  @RequireCapability("manageAutomations")
  @UseGuards(CsrfGuard)
  async remove(@Param("organizationId") organizationId: string, @Param("automationId") automationId: string) {
    await this.automations.remove(organizationId, automationId);
    return { success: true };
  }

  @Get(":automationId/executions")
  @RequireCapability("manageAutomations")
  async listExecutions(@Param("organizationId") organizationId: string, @Param("automationId") automationId: string) {
    return this.automations.listExecutions(organizationId, automationId);
  }
}

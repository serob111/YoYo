import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { upsertServiceSchema, type UpsertServiceInput } from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ServicesService } from "./services.service";

@Controller("organizations/:organizationId/services")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string) {
    return this.services.list(organizationId);
  }

  @Post()
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async create(@Param("organizationId") organizationId: string, @Body(new ZodValidationPipe(upsertServiceSchema)) body: UpsertServiceInput) {
    return this.services.create(organizationId, body);
  }

  @Patch(":serviceId")
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async update(
    @Param("organizationId") organizationId: string,
    @Param("serviceId") serviceId: string,
    @Body(new ZodValidationPipe(upsertServiceSchema)) body: UpsertServiceInput
  ) {
    return this.services.update(organizationId, serviceId, body);
  }

  @Delete(":serviceId")
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async remove(@Param("organizationId") organizationId: string, @Param("serviceId") serviceId: string) {
    await this.services.remove(organizationId, serviceId);
    return { success: true };
  }
}

import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { upsertBusinessProfileSchema, type UpsertBusinessProfileInput } from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BusinessService } from "./business.service";

@Controller("organizations/:organizationId/business-profile")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get()
  async get(@Param("organizationId") organizationId: string) {
    return this.business.getOrThrow(organizationId);
  }

  @Put()
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async upsert(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(upsertBusinessProfileSchema)) body: UpsertBusinessProfileInput
  ) {
    return this.business.upsert(organizationId, body);
  }
}

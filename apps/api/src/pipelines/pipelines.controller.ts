import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { PipelinesService } from "./pipelines.service";

@Controller("organizations/:organizationId/pipeline")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Get()
  async get(@Param("organizationId") organizationId: string) {
    return this.pipelines.getDefault(organizationId);
  }
}

import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { sampleLeadSchema, type SampleLeadInput } from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DemoService } from "./demo.service";

@Controller("organizations/:organizationId/demo")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post("sample-lead")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async sampleLead(@Param("organizationId") organizationId: string, @Body(new ZodValidationPipe(sampleLeadSchema)) body: SampleLeadInput) {
    return this.demo.sendSampleLead(organizationId, body);
  }
}

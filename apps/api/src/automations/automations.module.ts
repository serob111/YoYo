import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { AutomationsController } from "./automations.controller";
import { AutomationsService } from "./automations.service";

@Module({
  imports: [AuthModule, TenantGuardsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService]
})
export class AutomationsModule {}

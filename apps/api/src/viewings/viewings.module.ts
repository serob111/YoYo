import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { ViewingsController } from "./viewings.controller";
import { ViewingsService } from "./viewings.service";

@Module({
  imports: [AuthModule, TenantGuardsModule],
  controllers: [ViewingsController],
  providers: [ViewingsService],
  exports: [ViewingsService]
})
export class ViewingsModule {}

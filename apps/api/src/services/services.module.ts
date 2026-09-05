import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { ServicesController } from "./services.controller";
import { ServicesService } from "./services.service";

@Module({
  imports: [AuthModule, TenantGuardsModule],
  controllers: [ServicesController],
  providers: [ServicesService]
})
export class ServicesModule {}

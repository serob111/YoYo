import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { BusinessController } from "./business.controller";
import { BusinessService } from "./business.service";

@Module({
  imports: [AuthModule, TenantGuardsModule],
  controllers: [BusinessController],
  providers: [BusinessService]
})
export class BusinessModule {}

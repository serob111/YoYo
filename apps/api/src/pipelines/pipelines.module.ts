import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { PipelinesController } from "./pipelines.controller";
import { PipelinesService } from "./pipelines.service";

@Module({
  imports: [AuthModule, TenantGuardsModule],
  controllers: [PipelinesController],
  providers: [PipelinesService],
  exports: [PipelinesService]
})
export class PipelinesModule {}

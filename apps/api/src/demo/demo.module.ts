import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { OutboxModule } from "../common/outbox.module";
import { DemoController } from "./demo.controller";
import { DemoService } from "./demo.service";

@Module({
  imports: [AuthModule, TenantGuardsModule, OutboxModule],
  controllers: [DemoController],
  providers: [DemoService]
})
export class DemoModule {}
